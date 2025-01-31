import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";


const MockERC20TokenModule = buildModule("MockERC20TokenModule", (m) => {
  const Token = m.contract("MockERC20Token", ["Decimal Token", "B10", 18]);
  return { Token };
});

export default MockERC20TokenModule;
