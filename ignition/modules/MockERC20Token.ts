import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";


const MockERC20TokenModule = buildModule("MockERC20TokenModule", (m) => {
  const Token = m.contract("MockERC20Token", ["USD Token", "USDT", 6]);
  return { Token };
});

export default MockERC20TokenModule;
