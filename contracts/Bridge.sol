// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./BridgeValidator.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPyth.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title Bridge
 * @dev Main bridge contract implementing lock and release functionality
 */
contract Bridge is ReentrancyGuard, Pausable, AccessControl, Ownable {
    using ECDSA for bytes32;

    // Custom errors
    error Unauthorized();      // For admin and validator checks
    error InvalidInput();      // For invalid parameters
    error AlreadyProcessed();  // For duplicate transactions
    error InsufficientBalance();
    error TransferFailed();
    error RateLimitExceeded();
    error InvalidPriceFeed();
    error StalePrice();
    error MaxValidatorsReached();
    error ValidationFailed();
    error InvalidSignature();
    error SignatureExpired();
    error NonceAlreadyUsed();
    error AccountBlacklisted();
    error InvalidRecoverySignatures();
    error DailyLimitExceeded();

    // Storage optimization: Pack related variables together
    struct RateLimit {
        uint64 lastTransferTime;   // 8 bytes
        uint192 transferredAmount; // 24 bytes - Sufficient for amount tracking
    }

    struct ValidatorInfo {
        uint8 signatureCount;      // 1 byte - Max 255 signatures is sufficient
        mapping(address => bool) hasValidated;
    }

    // Constants - Moved to immutable for gas savings
    bytes32 private immutable DOMAIN_SEPARATOR;
    uint256 private immutable PRICE_FEED_MAX_AGE;
    uint256 private immutable ADMIN_DELAY;
    uint256 private immutable RATE_LIMIT_DURATION;
    uint256 private immutable MAX_TRANSFER_PER_HOUR;
    uint256 private immutable REQUIRED_SIGNATURES;
    uint16 private immutable MAX_VALIDATORS; // Max number of validators allowed

    // State variables
    address public admin;
    address public pythContract;
    uint16 public validatorCount;  // Packed: Max 65535 validators is sufficient

    // Mappings
    mapping(address => bytes32) public tokenPriceFeeds;
    mapping(address => RateLimit) private rateLimits;
    mapping(bytes32 => ValidatorInfo) private validatorInfo;
    mapping(bytes32 => bool) public processedHashes;
    mapping(address => bool) public validators;
    mapping(address => uint256) public userNonces;
    mapping(address => bool) public blacklistedAccounts;
    mapping(address => uint256) public dailyOperationAmounts;
    mapping(address => uint256) public lastOperationDay;
    
    // Recovery mechanism
    uint256 public constant RECOVERY_THRESHOLD = 3;  // Number of validators needed for recovery
    mapping(address => mapping(address => bool)) public recoverySigners; // account => validator => has signed

    // Events
    event TokensLocked(
        address indexed token,
        address indexed from,
        uint256 amount,
        bytes32 indexed targetChainTxHash
    );
    event AdminChanged(address indexed previousAdmin, address indexed newAdmin);
    event NativeTokenLocked(
        address indexed from,
        uint256 amount,
        bytes32 indexed targetChainTxHash
    );
    event NativeTokenReleased(
        address indexed to,
        uint256 amount,
        bytes32 indexed sourceChainTxHash
    );
    event TokensReleased(
        address indexed token,
        address indexed to,
        uint256 amount,
        bytes32 indexed sourceChainTxHash
    );
    event ValidatorAdded(address indexed validator);
    event ValidatorRemoved(address indexed validator);
    event SignatureSubmitted(bytes32 indexed txHash, address indexed validator);
    event PriceFeedUpdated(address indexed token, bytes32 indexed priceId);
    event PythContractUpdated(address indexed oldPyth, address indexed newPyth);

    // Modifiers
    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlyValidator() {
        if (!validators[msg.sender]) revert Unauthorized();
        _;
    }

    constructor(
        address _pythContract,
        uint256 _maxAge,
        uint256 _adminDelay,
        uint256 _rateLimitDuration,
        uint256 _maxTransferPerHour,
        uint256 _requiredSignatures,
        uint16 _maxValidators
    ) Ownable(msg.sender) {
        if (_pythContract == address(0)) revert InvalidInput();
        if (_requiredSignatures == 0 || _requiredSignatures > _maxValidators) revert InvalidInput();
        if (_maxValidators == 0) revert InvalidInput();
        
        PRICE_FEED_MAX_AGE = _maxAge;
        ADMIN_DELAY = _adminDelay;
        RATE_LIMIT_DURATION = _rateLimitDuration;
        MAX_TRANSFER_PER_HOUR = _maxTransferPerHour;
        REQUIRED_SIGNATURES = _requiredSignatures;
        MAX_VALIDATORS = _maxValidators;
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        admin = msg.sender;
        validators[msg.sender] = true;
        validatorCount = 1;
        pythContract = _pythContract;

        // Initialize EIP-712 domain separator
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("DecimalBridge")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    // Owner function to change admin
    /**
     * @dev Updates the Pyth contract address
     * @param _pythContract The new Pyth contract address
     */
    function updatePythContract(address _pythContract) external onlyAdmin {
        if (_pythContract == address(0)) revert InvalidInput();
        address oldPyth = pythContract;
        pythContract = _pythContract;
        emit PythContractUpdated(oldPyth, _pythContract);
    }

    /**
     * @dev Sets or updates the price feed ID for a token
     * @param token The token address to set the price feed for
     * @param priceId The Pyth price feed ID
     */
    function setPriceFeed(address token, bytes32 priceId) external onlyAdmin {
        if (priceId == bytes32(0)) revert InvalidPriceFeed();
        tokenPriceFeeds[token] = priceId;
        emit PriceFeedUpdated(token, priceId);
    }

    /**
     * @dev Gets the latest price for a token
     * @param token The token address to get the price for
     * @return price The latest price (normalized to 8 decimals)
     */
    function getLatestPrice(address token) public view returns (uint256) {
        bytes32 priceId = tokenPriceFeeds[token];
        if (priceId == bytes32(0)) revert InvalidPriceFeed();

        // Cache pythContract to avoid multiple SLOADs
        address pythAddr = pythContract;
        IPyth.PriceFeed memory priceFeed = IPyth(pythAddr).getPrice(priceId, PRICE_FEED_MAX_AGE);

        int64 rawPrice = priceFeed.price.price;
        if (rawPrice <= 0) revert InvalidPriceFeed();

        // Optimize exponent calculations
        int32 expo = priceFeed.price.expo;
        int256 normalizedPrice = int256(rawPrice);
        
        unchecked {
            // Safe to use unchecked as expo bounds are known from Pyth
            if (expo < -8) {
                // For negative exponents: divide by 10^|expo + 8|
                int256 absExpo = (-int256(expo) - 8); // First convert to int256
                require(absExpo > 0, "Invalid exponent");
                uint256 divisor = 10 ** uint256(absExpo);
                normalizedPrice = normalizedPrice / int256(divisor);
            } else if (expo > -8) {
                // For positive exponents: multiply by 10^(expo + 8)
                int256 absExpo = int256(expo) + 8; // First convert to int256
                require(absExpo >= 0, "Invalid exponent");
                uint256 multiplier = 10 ** uint256(absExpo);
                normalizedPrice = normalizedPrice * int256(multiplier);
            }
        }

        if (normalizedPrice <= 0) revert InvalidPriceFeed();
        return uint256(normalizedPrice);
    }

    // Main public function that admin calls
    function executeTokenOperation(
        address token,
        address account,
        uint256 amount,
        bytes32 txHash,
        bool isLock,  // true for lock, false for release
        bytes calldata userSignature,  // User's signature for authorization
        uint256 deadline,  // Timestamp after which the signature expires
        uint256 nonce     // User's current nonce
    ) external payable onlyAdmin {
        if (processedHashes[txHash]) revert AlreadyProcessed();
        
        // Check if account is blacklisted
        if (blacklistedAccounts[account]) revert AccountBlacklisted();

        // Check signature expiry
        if (block.timestamp > deadline) revert SignatureExpired();

        // Verify nonce
        if (userNonces[account] != nonce) revert InvalidInput();
        userNonces[account] = nonce + 1;

        // Check daily limits
        updateAndCheckDailyLimit(account, amount);

        // Verify user signature
        verifyUserSignature(
            token,
            account,
            amount,
            txHash,
            isLock,
            nonce,
            deadline,
            userSignature
        );

        // Check rate limit
        checkRateLimit(account, amount);
        
        // For non-native tokens, check price feed
        if (token != address(0)) {
            uint256 tokenPrice = getLatestPrice(token);
            if (tokenPrice == 0) revert InvalidPriceFeed();
        }
        
        // Process transaction
        processedHashes[txHash] = true;
        
        // Execute token operation based on isLock parameter
        if (isLock) {
            // For native token locks, check if sent amount matches
            if (token == address(0)) {
                if (msg.value != amount) revert InvalidInput();
            }
            _lockTokens(token, account, amount, txHash);
        } else {
            if (token == address(0)) {
                // For native token releases, ensure contract has enough balance
                if (address(this).balance < amount) revert InsufficientBalance();
            }
            _releaseTokens(token, account, amount, txHash);
        }
    }

    // Validator management
    function addValidator(address validator) external onlyAdmin {
        if (validator == address(0)) revert InvalidInput();
        if (validators[validator]) revert InvalidInput();
        if (validatorCount >= MAX_VALIDATORS) revert MaxValidatorsReached();

        validators[validator] = true;
        unchecked { validatorCount++; }
        emit ValidatorAdded(validator);
    }

    function removeValidator(address validator) external onlyAdmin {
        if (validator == address(0)) revert InvalidInput();
        if (!validators[validator]) revert InvalidInput();
        if (validatorCount <= REQUIRED_SIGNATURES) revert InvalidInput();

        validators[validator] = false;
        unchecked { validatorCount--; }
        emit ValidatorRemoved(validator);
    }

    function signTransaction(bytes32 txHash) external onlyValidator {
        if (processedHashes[txHash]) revert AlreadyProcessed();
        
        ValidatorInfo storage info = validatorInfo[txHash];
        if (info.hasValidated[msg.sender]) revert InvalidInput();

        info.hasValidated[msg.sender] = true;
        unchecked { info.signatureCount++; }

        emit SignatureSubmitted(txHash, msg.sender);

        if (info.signatureCount >= uint8(REQUIRED_SIGNATURES)) {
            processedHashes[txHash] = true;
        }
    }

    function hasValidatorSigned(bytes32 txHash, address validator) external view returns (bool) {
        return validatorInfo[txHash].hasValidated[validator];
    }

    function checkRateLimit(address account, uint256 amount) internal {
        RateLimit storage limit = rateLimits[account];
        uint256 currentTime = block.timestamp;

        // Reset rate limit if window has passed
        if (currentTime >= limit.lastTransferTime + RATE_LIMIT_DURATION) {
            limit.transferredAmount = uint192(amount);
            limit.lastTransferTime = uint64(currentTime);
            return;
        }

        // Check if new amount exceeds rate limit
        uint256 newAmount = limit.transferredAmount + amount;
        if (newAmount > MAX_TRANSFER_PER_HOUR) revert RateLimitExceeded();

        // Update rate limit
        limit.transferredAmount = uint192(newAmount);
    }

    function changeAdmin(address newAdmin) public onlyOwner {
        if (newAdmin == address(0)) revert InvalidInput();
        address oldAdmin = admin;
        admin = newAdmin;
        emit AdminChanged(oldAdmin, newAdmin);
    }

    function isTransactionProcessed(bytes32 txHash) external view returns (bool) {
        return processedHashes[txHash];
    }

    function getValidatorCount() external view returns (uint16) {
        return validatorCount;
    }

    function getSignatureCount(bytes32 txHash) external view returns (uint8) {
        return validatorInfo[txHash].signatureCount;
    }

    // Internal functions
    function _lockTokens(
        address token,
        address from,
        uint256 amount,
        bytes32 targetChainTxHash
    ) internal nonReentrant whenNotPaused {
        if (from == address(0)) revert InvalidInput();
        if (amount == 0) revert InvalidInput();

        if (token == address(0)) {
            // Native token lock - value already received in msg.value
            emit NativeTokenLocked(from, amount, targetChainTxHash);
        } else {
            // ERC20 token lock
            bool success = IERC20(token).transferFrom(from, address(this), amount);
            if (!success) revert TransferFailed();
            emit TokensLocked(token, from, amount, targetChainTxHash);
        }
    }

    function _releaseTokens(
        address token,
        address recipient,
        uint256 amount,
        bytes32 sourceChainTxHash
    ) internal nonReentrant whenNotPaused {
        if (recipient == address(0)) revert InvalidInput();
        if (amount == 0) revert InvalidInput();

        if (token == address(0)) {
            // Native token release
            (bool success, ) = payable(recipient).call{value: amount}("");
            if (!success) revert TransferFailed();
            emit NativeTokenReleased(recipient, amount, sourceChainTxHash);
        } else {
            // ERC20 token release
            bool success = IERC20(token).transfer(recipient, amount);
            if (!success) revert TransferFailed();
            emit TokensReleased(token, recipient, amount, sourceChainTxHash);
        }
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // Function to receive native tokens
    receive() external payable {}

    /**
     * @dev Updates and checks the daily operation limit for an account
     */
    function updateAndCheckDailyLimit(address account, uint256 amount) internal {
        uint256 currentDay = block.timestamp / 1 days;
        if (currentDay > lastOperationDay[account]) {
            dailyOperationAmounts[account] = 0;
            lastOperationDay[account] = currentDay;
        }

        uint256 newDailyAmount = dailyOperationAmounts[account] + amount;
        if (newDailyAmount > MAX_TRANSFER_PER_HOUR * 24) revert DailyLimitExceeded();
        dailyOperationAmounts[account] = newDailyAmount;
    }

    /**
     * @dev Blacklists an account in case of compromise
     * @param account The account to blacklist
     */
    function blacklistAccount(address account) external onlyAdmin {
        blacklistedAccounts[account] = true;
    }

    /**
     * @dev Removes an account from the blacklist
     * @param account The account to unblacklist
     */
    function unblacklistAccount(address account) external onlyAdmin {
        blacklistedAccounts[account] = false;
    }

    /**
     * @dev Emergency account recovery mechanism
     * @param compromisedAccount The account to recover
     * @param newAccount The new account to transfer control to
     */
    function initiateAccountRecovery(
        address compromisedAccount,
        address newAccount
    ) external onlyValidator {
        if (newAccount == address(0)) revert InvalidInput();
        if (!blacklistedAccounts[compromisedAccount]) revert InvalidInput();

        recoverySigners[compromisedAccount][msg.sender] = true;
        
        // Count signatures
        uint256 sigCount;
        for (uint256 i = 0; i < validatorCount; i++) {
            if (recoverySigners[compromisedAccount][msg.sender]) {
                sigCount++;
            }
        }

        // If enough validators have signed, perform the recovery
        if (sigCount >= RECOVERY_THRESHOLD) {
            // Transfer all relevant state to the new account
            userNonces[newAccount] = userNonces[compromisedAccount];
            dailyOperationAmounts[newAccount] = dailyOperationAmounts[compromisedAccount];
            lastOperationDay[newAccount] = lastOperationDay[compromisedAccount];

            // Clear old account state
            delete userNonces[compromisedAccount];
            delete dailyOperationAmounts[compromisedAccount];
            delete lastOperationDay[compromisedAccount];
            delete blacklistedAccounts[compromisedAccount];

            // Clear recovery state
            for (uint256 i = 0; i < validatorCount; i++) {
                delete recoverySigners[compromisedAccount][msg.sender];
            }
        }
    }

    /**
     * @dev Returns the current nonce for an account
     */
    function getCurrentNonce(address account) external view returns (uint256) {
        return userNonces[account];
    }

    /**
     * @dev Returns the message hash that should be signed by the user
     * @param token The token address (address(0) for native token)
     * @param account The user's account
     * @param amount The amount of tokens
     * @param txHash The transaction hash
     * @param isLock Whether this is a lock operation
     */
    function getMessageHash(
        address token,
        address account,
        uint256 amount,
        bytes32 txHash,
        bool isLock,
        uint256 nonce,
        uint256 deadline
    ) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(
                    keccak256("BridgeOperation(address token,address account,uint256 amount,bytes32 txHash,bool isLock,uint256 nonce,uint256 deadline)"),
                    token,
                    account,
                    amount,
                    txHash,
                    isLock,
                    nonce,
                    deadline
                ))
            )
        );
    }

    /**
     * @dev Verifies that the signature is valid for the given parameters
     */
    function verifyUserSignature(
        address token,
        address account,
        uint256 amount,
        bytes32 txHash,
        bool isLock,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) internal view {
        bytes32 messageHash = getMessageHash(token, account, amount, txHash, isLock, nonce, deadline);
        address signer = messageHash.recover(signature);
        
        // For lock operations, signer must be the account
        // For release operations, signer must be the recipient
        if (signer != account) revert InvalidSignature();
    }
}
