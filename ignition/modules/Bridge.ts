import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";


const BridgeModule = buildModule("BridgeModule", (m) => {
  const validatorAddress = process.env.VALIDATOR!;
  const validator = m.contract("BridgeValidator", [validatorAddress]);
  const bridge = m.contract("Bridge", [validator, 123]);
  return { bridge, validator };
});

export default BridgeModule;
