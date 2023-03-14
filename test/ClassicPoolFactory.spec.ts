import chai, { expect } from 'chai';
import { Contract } from 'ethers';
import { solidity } from 'ethereum-waffle';
import { expandTo18Decimals } from './shared/utilities';
import { deployClassicPoolFactory, deployPoolMaster, deployTestERC20, deployVault, deployWETH9 } from './shared/fixtures';
import { Artifact, HardhatRuntimeEnvironment } from 'hardhat/types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ZERO_ADDRESS } from './shared/utilities';
import { defaultAbiCoder } from 'ethers/lib/utils';

const hre: HardhatRuntimeEnvironment = require('hardhat');
const ethers = require("hardhat").ethers;
chai.use(solidity);

describe('SyncSwapClassicPoolFactory', () => {
  let wallets: SignerWithAddress[];
  let testTokens: [string, string];

  before(async () => {
    wallets = await ethers.getSigners();

    const tokenA = await deployTestERC20(expandTo18Decimals(10000), 18);
    const tokenB = await deployTestERC20(expandTo18Decimals(10000), 18);
    testTokens = [tokenA.address, tokenB.address];
  });

  let weth: Contract;
  let vault: Contract;
  let master: Contract;
  let feeManager: Contract;
  let factory: Contract;

  beforeEach(async () => {
    weth = await deployWETH9();
    vault = await deployVault(weth.address);
    [master, feeManager] = await deployPoolMaster(vault.address);
    factory = await deployClassicPoolFactory(master);
  });

  /*
  it('INIT_CODE_PAIR_HASH', async () => {
    expect(await factory.INIT_CODE_PAIR_HASH()).to.eq('0x0a44d25bd998b8cce3bec356e00044787b55feabe1b89cb62eba44ef25855128')
  })
  */

  async function createClassicPool(tokenA: string, tokenB: string) {
    const [token0, token1]: [string, string] = (
      tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA]
    );

    const data: string = defaultAbiCoder.encode(
      ["address", "address"], [tokenA, tokenB]
    );
    await expect(master.createPool(factory.address, data))
      .to.emit(factory, 'PoolCreated')
      .to.emit(master, 'RegisterPool');

    await expect(master.createPool(factory.address, data)).to.be.reverted;
    await expect(master.createPool(factory.address, data)).to.be.reverted;

    const poolAddress: string = await factory.getPool(tokenA, tokenB);
    expect(await factory.getPool(tokenB, tokenA)).to.eq(poolAddress);
    expect(await master.isPool(poolAddress)).to.eq(true);
    //expect(await factory.pools(0)).to.eq(poolAddress);
    //expect(await factory.poolsLength()).to.eq(1);

    const poolArtifact: Artifact = await hre.artifacts.readArtifact('SyncSwapClassicPool');
    const pool = new Contract(poolAddress, poolArtifact.abi, ethers.provider);
    expect(await pool.poolType()).to.eq(1);
    expect(await pool.master()).to.eq(master.address);
    expect(await pool.vault()).to.eq(vault.address);
    expect(await pool.token0()).to.eq(token0);
    expect(await pool.token1()).to.eq(token1);
  };

  it('Should create a classic pool', async () => {
    await createClassicPool(testTokens[0], testTokens[1]);
  });

  it('Should create a classic pool in reverse tokens', async () => {
    await createClassicPool(testTokens[1], testTokens[0]);
  });

  it('Should use expected gas on creating classic pool', async () => {
    const data = defaultAbiCoder.encode(
      ["address", "address"], [testTokens[0], testTokens[1]]
    );
    const tx = await master.createPool(factory.address, data);
    const receipt = await tx.wait();
    expect(receipt.gasUsed).to.eq(3698262); // 2512920 for Uniswap V2
  });

  /*
  it('Should set a new fee recipient', async () => {
    // Set fee recipient using a wrong account.
    await expect(factory.connect(wallets[1]).setFeeRecipient(wallets[1].address)).to.be.reverted;

    // Set a new fee recipient.
    await factory.setFeeRecipient(wallets[0].address);

    // Expect new fee recipient.
    expect(await factory.feeRecipient()).to.eq(wallets[0].address);
  });

  it('Should set a new protocol fee', async () => {
    // Expect current protocol fee.
    expect(await factory.getProtocolFee()).to.eq(30000);

    // Set protocol fee using wrong account.
    await expect(factory.connect(wallets[1]).setProtocolFee(50000)).to.be.reverted;

    // Set a new protocol fee.
    await factory.setProtocolFee(50000);

    // Expect new protocol fee.
    expect(await factory.getProtocolFee()).to.eq(50000);
  });
  */
});