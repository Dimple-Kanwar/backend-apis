import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";


const BridgeModule = buildModule("BridgeModule", (m) => {
  const validatorAddress = process.env.VALIDATOR!;
  const validator = m.contract("BridgeValidator", [validatorAddress]);
  console.log({ validator })
  const bridge = m.contract("Bridge", [validator, 123]);
  console.log({ bridge })
  return { bridge, validator };
});

export default BridgeModule;
