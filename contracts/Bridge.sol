// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPyth.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Bridge
 * @dev Main bridge contract implementing lock and release functionality
 */
contract Bridge is ReentrancyGuard, Pausable, AccessControl, Ownable {

    // Custom errors
    error Unauthorized(); // For admin and validator checks
    error InvalidInput(); // For invalid parameters
    error AlreadyProcessed(); // For duplicate transactions
    error InsufficientBalance();
    error TransferFailed();
    error RateLimitExceeded();
    error InvalidPriceFeed();
    error StalePrice();
    error InvalidSignature();
    error SignatureExpired();
    error NonceAlreadyUsed();
    error AccountBlacklisted();
    error InvalidRecoverySignatures();
    error DailyLimitExceeded();

    // Storage optimization: Pack related variables together
    struct RateLimit {
        uint64 lastTransferTime; // 8 bytes
        uint192 transferredAmount; // 24 bytes - Sufficient for amount tracking
    }

    // Constants - Moved to immutable for gas savings
    bytes32 private immutable DOMAIN_SEPARATOR;
    uint256 private immutable PRICE_FEED_MAX_AGE;
    uint256 private immutable ADMIN_DELAY;
    uint256 private immutable RATE_LIMIT_DURATION;
    uint256 private immutable MAX_TRANSFER_PER_HOUR;

    // State variables
    address public admin;
    address public pythContract;

    // Mappings
    mapping(address => bytes32) public tokenPriceFeeds;
    mapping(address => RateLimit) private rateLimits;
    mapping(bytes32 => bool) public processedHashes;
    mapping(address => uint256) public userNonces;
    mapping(address => bool) public blacklistedAccounts;
    mapping(address => uint256) public dailyOperationAmounts;
    mapping(address => uint256) public lastOperationDay;

    // Events
    event TokensLocked(
        address indexed token,
        address indexed sender,
        uint256 amount,
        bytes32 targetChainTxHash
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
    event PriceFeedUpdated(address indexed token, bytes32 indexed priceId);
    event PythContractUpdated(address indexed oldPyth, address indexed newPyth);
    event AccountRecovered(address indexed compromisedAccount, address indexed newAccount);

    // Modifiers
    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
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
        if (_requiredSignatures == 0 || _requiredSignatures > _maxValidators)
            revert InvalidInput();
        if (_maxValidators == 0) revert InvalidInput();

        PRICE_FEED_MAX_AGE = _maxAge;
        ADMIN_DELAY = _adminDelay;
        RATE_LIMIT_DURATION = _rateLimitDuration;
        MAX_TRANSFER_PER_HOUR = _maxTransferPerHour;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        admin = msg.sender;
        pythContract = _pythContract;

        // Initialize EIP-712 domain separator
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("DecimalBridge")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

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
        IPyth.PriceFeed memory priceFeed = IPyth(pythAddr).getPrice(
            priceId,
            PRICE_FEED_MAX_AGE
        );

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

    // Lock tokens function
    function lockToken(
        address token,
        address account,
        uint256 amount,
        bytes32 txHash,
        bytes calldata userSignature, // User's signature for authorization
        uint256 deadline, // Timestamp after which the signature expires
        uint256 nonce // User's current nonce
    ) external payable nonReentrant whenNotPaused {
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
            true, // Lock operation
            nonce,
            deadline,
            userSignature
        );

        // Check rate limit
        checkRateLimit(account, amount);

        // Check token approval
        uint256 currentAllowance = IERC20(token).allowance(account, address(this));
        require(currentAllowance >= amount, "Insufficient allowance to lock tokens");

        // For non-native tokens, check price feed
        if (token != address(0)) {
            uint256 tokenPrice = getLatestPrice(token);
            if (tokenPrice == 0) revert InvalidPriceFeed();
        }

        // Process transaction
        processedHashes[txHash] = true;

        // For native token locks, check if sent amount matches
        if (token == address(0)) {
            if (msg.value != amount) revert InvalidInput();
        }
        _lockTokens(token, account, amount, txHash);
    }

    // Release tokens function
    function releaseToken(
        address token,
        address account,
        uint256 amount,
        bytes32 txHash
    ) external onlyAdmin nonReentrant whenNotPaused {
        if (processedHashes[txHash]) revert AlreadyProcessed();

        // Ensure contract has enough balance for release
        if (token == address(0)) {
            if (address(this).balance < amount) revert InsufficientBalance();
        }
      
        // Process transaction
        processedHashes[txHash] = true;
        _releaseTokens(token, account, amount, txHash);
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

    function isTransactionProcessed(
        bytes32 txHash
    ) external view returns (bool) {
        return processedHashes[txHash];
    }

    // Internal functions
    function _lockTokens(
        address token,
        address from,
        uint256 amount,
        bytes32 targetChainTxHash
    ) internal {
        if (from == address(0)) revert InvalidInput();
        if (amount == 0) revert InvalidInput();

        if (token == address(0)) {
            // Native token lock - value already received in msg.value
            emit NativeTokenLocked(from, amount, targetChainTxHash);
        } else {
            // ERC20 token lock
            bool success = IERC20(token).transferFrom(
                from,
                address(this),
                amount
            );
            if (!success) revert TransferFailed();
            emit TokensLocked(token, from, amount, targetChainTxHash);
        }
    }

    function _releaseTokens(
        address token,
        address recipient,
        uint256 amount,
        bytes32 sourceChainTxHash
    ) internal  {
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
    function updateAndCheckDailyLimit(
        address account,
        uint256 amount
    ) internal {
        uint256 currentDay = block.timestamp / 1 days;
        if (currentDay > lastOperationDay[account]) {
            dailyOperationAmounts[account] = 0;
            lastOperationDay[account] = currentDay;
        }

        uint256 newDailyAmount = dailyOperationAmounts[account] + amount;
        if (newDailyAmount > MAX_TRANSFER_PER_HOUR * 24)
            revert DailyLimitExceeded();
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
     * @param signature The signature from the compromised account for authorization
     */
    function initiateAccountRecovery(
        address compromisedAccount,
        address newAccount,
        bytes calldata signature
    ) external onlyAdmin nonReentrant {
        if (newAccount == address(0)) revert InvalidInput();
        if (!blacklistedAccounts[compromisedAccount]) revert InvalidInput();

        // Verify the signature
        bytes32 messageHash = keccak256(abi.encodePacked(compromisedAccount, newAccount));
        bytes32 ethSignedMessageHash = getEthSignedMessageHash(messageHash);
        address signer = ECDSA.recover(ethSignedMessageHash, signature);
        if (signer != compromisedAccount) revert Unauthorized();

        // Transfer all relevant state to the new account
        userNonces[newAccount] = userNonces[compromisedAccount];
        dailyOperationAmounts[newAccount] = dailyOperationAmounts[compromisedAccount];
        lastOperationDay[newAccount] = lastOperationDay[compromisedAccount];

        // Clear old account state
        delete userNonces[compromisedAccount];
        delete dailyOperationAmounts[compromisedAccount];
        delete lastOperationDay[compromisedAccount];
        delete blacklistedAccounts[compromisedAccount];

        // Emit an event for recovery
        emit AccountRecovered(compromisedAccount, newAccount);
    }

    /**
     * @dev Returns the current nonce for an account
     */
    function getCurrentNonce(address account) external view returns (uint256) {
        return userNonces[account];
    }

    function getEthSignedMessageHash(bytes32 _msgHash) internal pure returns(bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _msgHash));
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
        return
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    DOMAIN_SEPARATOR,
                    keccak256(
                        abi.encode(
                            keccak256(
                                "BridgeOperation(address token,address account,uint256 amount,bytes32 txHash,bool isLock,uint256 nonce,uint256 deadline)"
                            ),
                            token,
                            account,
                            amount,
                            txHash,
                            isLock,
                            nonce,
                            deadline
                        )
                    )
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
        bytes32 messageHash = getMessageHash(
            token,
            account,
            amount,
            txHash,
            isLock,
            nonce,
            deadline
        );
        address signer = ECDSA.recover(messageHash, signature);

        // For lock operations, signer must be the account
        // For release operations, signer must be the recipient
        if (signer != account) revert InvalidSignature();
    }

    function splitSignature(bytes memory signature) internal pure returns(bytes32 r, bytes32 s, uint8 v) {
        require(signature.length == 65, "Invalid signature length");
        assembly {
            /*
            First 32 bytes stores the length of the signature

            add(sig, 32) = pointer of sig + 32
            effectively, skips first 32 bytes of signature

            mload(p) loads next 32 bytes starting at the memory address p into memory
            */

            // first 32 bytes, after the length prefix
            r := mload(add(signature, 32))
            // second 32 bytes
            s := mload(add(signature, 64))
            // final byte (first byte of the next 32 bytes)
            v := byte(0,mload(add(signature, 96)))
        }
        // implicitly return (r, s, v)        
    }
    
    function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory signature) internal pure returns(address){
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(signature);
        return ECDSA.recover(_ethSignedMessageHash, v, r, s);
    }
}
