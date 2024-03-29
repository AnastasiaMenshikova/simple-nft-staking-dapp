const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains, INITIAL_SUPPLY, BLOCK_REWARD } = require("../helper-hardhat-config")
const { moveBlocksNoComment } = require("../utils/move-blocks")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("NFT Staking Unit Tests", function () {
          let token, tokenContract, gardenNft, gardenContract, nftStaking, nftStakingContract

          const mintPrice = ethers.utils.parseEther("0.1")
          const nftAmount = 5
          const tokenId = 50

          beforeEach(async () => {
              accounts = await ethers.getSigners()
              deployer = accounts[0]
              user1 = accounts[1]
              user2 = accounts[2]

              await deployments.fixture(["all"])

              // deploying contracts
              tokenContract = await ethers.getContractFactory("Token")
              token = await tokenContract.deploy(INITIAL_SUPPLY)

              gardenContract = await ethers.getContractFactory("GardenNFT")
              gardenNft = await gardenContract.deploy(mintPrice)

              nftStakingContract = await ethers.getContractFactory("NftStaking")
              nftStaking = await nftStakingContract.deploy(
                  token.address,
                  gardenNft.address,
                  INITIAL_SUPPLY,
                  BLOCK_REWARD,
                  tokenId
              )

              // send ERC20 tokens to staking contract's reward pool
              tx = await token.connect(deployer).transfer(nftStaking.address, INITIAL_SUPPLY)

              // user1 mint NFTs
              const fee = ethers.utils.formatEther(mintPrice) * nftAmount
              const txResponse = await gardenNft
                  .connect(user1)
                  .mint(tokenId, nftAmount, { value: ethers.utils.parseEther(fee.toString()) })
              await txResponse.wait(1)
              // user1 approve NFTs to Staking Nft contract
              const approveTX = await gardenNft
                  .connect(user1)
                  .setApprovalForAll(nftStaking.address, true)
              await approveTX.wait(1)
          })

          it("was deployed", async () => {
              assert(nftStaking.address)
          })
          describe("constructor", () => {
              it("Should have correct reward pool", async () => {
                  const rewardPool = ethers.utils.formatEther(
                      await token.balanceOf(nftStaking.address)
                  )
                  assert.equal(rewardPool, ethers.utils.formatEther(INITIAL_SUPPLY))
              })

              it("Should have correct Pool Key (NFT id)", async () => {
                  const poolKey = await nftStaking.getPoolKeyToken()
                  assert.equal(poolKey, tokenId)
              })
          })

          describe("stake()", () => {
              it("allow users to stake NFTs and emit event", async () => {
                  const nftStakingConnectedContract = await nftStaking.connect(user1)
                  await expect(nftStakingConnectedContract.stake(nftAmount, tokenId)).to.emit(
                      nftStaking,
                      "Staked"
                  )
              })
              it("shows correct number NFTs staked by user", async () => {
                  const amount = 2
                  const nftStakingConnectedContract = await nftStaking.connect(user1)
                  await nftStakingConnectedContract.stake(amount, tokenId)
                  const staked = await nftStaking.totalStakedFor(user1.address)
                  assert.equal(staked, amount)
              })
          })

          describe("unstake()", () => {
              it("allow users to unstake NFTs and emit event", async () => {
                  const tx1 = await nftStaking.connect(user1).stake(nftAmount, tokenId)
                  const tx2 = await nftStaking.connect(user1).unstake(nftAmount, tokenId)
                  await expect(tx2).to.emit(nftStaking, "Unstaked")
              })
          })
          describe("claim()", () => {
              beforeEach(async () => {
                  const tx1 = await nftStaking.connect(user1).stake(nftAmount, tokenId)
              })
              it("revert function, if user didn't stake NFT", async () => {
                  await expect(nftStaking.connect(user2).claim()).to.be.revertedWith(
                      "stake to start earning rewards"
                  )
              })
              it("allow users to claim rewards and emit event", async () => {
                  const blockNumber = 2
                  // wait for rewards to accumulate, move 2 blocks
                  if ((network.config.chainId = "31337")) {
                      await moveBlocksNoComment(blockNumber, (sleepAmount = 10))
                  }

                  // calculates token rewards correctly
                  const earned = ethers.utils.formatEther(await nftStaking.earned(user1.address))
                  const expectEarned = ethers.utils.formatEther(
                      blockNumber * BLOCK_REWARD * nftAmount
                  )
                  assert.equal(earned, expectEarned)

                  // can claim rewards and emit event
                  const tx2 = await nftStaking.connect(user1).claim()
                  await expect(tx2).to.emit(nftStaking, "RewardsClaimed")
              })
          })

          describe("Empty ERC20 Reward pool", () => {
              beforeEach(async () => {
                  // change reward block to initial supply ERC20 reward token
                  const deployerConnected = await nftStaking.connect(deployer)
                  const newBlockReward = ethers.utils.parseEther(INITIAL_SUPPLY)
                  const tx1 = await deployerConnected.changeBlockReward(newBlockReward)

                  // user1 will drain reward pool
                  const tx2 = await nftStaking.connect(user1).stake(2, tokenId)

                  // wait for rewards to accumulate, move 1 block
                  if ((network.config.chainId = "31337")) {
                      await moveBlocksNoComment(1, (sleepAmount = 10))
                  }

                  const tx3 = await nftStaking.connect(user1).claim()
              })

              it("users can't stake, if reward pool is empty", async () => {
                  await expect(nftStaking.connect(user1).stake(2, tokenId)).to.be.revertedWith(
                      "no rewards left"
                  )
              })

              it("users can't claim, if reward pool is empty", async () => {
                  await expect(nftStaking.connect(user1).claim()).to.be.revertedWith(
                      "no rewards left"
                  )
              })
              it("users can unstake their NFTs, if reward pool is empty", async () => {
                  await expect(nftStaking.connect(user1).unstake(2, tokenId)).to.emit(
                      nftStaking,
                      "Unstaked"
                  )
              })
              it("shows 0 earned rewards, if reward pool is empty", async () => {
                  const earned = await nftStaking.earned(user1.address)
                  assert.equal(earned, 0)
              })
          })

          describe("Only owner", () => {
              beforeEach(async () => {
                  NftStakingConnectedContract = await nftStaking.connect(user1)
              })
              it("can pause contract in case of emergency", async () => {
                  // can't access function if not the owner
                  await expect(NftStakingConnectedContract.setPaused(true)).to.be.revertedWith(
                      "NotOwner()"
                  )
                  // if owner, can set pause in case of emergency
                  const tx = await nftStaking.connect(deployer).setPaused(true)
                  const contractPause = await nftStaking.paused()
                  assert.equal(contractPause, true)

                  // users can't call `stake()`, `unstake()` and `claim()`functions, if contract is paused
                  const tx1 = NftStakingConnectedContract.stake(nftAmount, tokenId)
                  await expect(tx1).to.be.revertedWith("ContractPaused()")
                  const tx2 = NftStakingConnectedContract.unstake(nftAmount, tokenId)
                  await expect(tx2).to.be.revertedWith("ContractPaused()")
                  const tx3 = NftStakingConnectedContract.claim()
                  await expect(tx3).to.be.revertedWith("ContractPaused()")
              })

              it("can change Block Reward", async () => {
                  const newBlockReward = ethers.utils.parseEther("0.0001")
                  // can't access function if not the owner
                  await expect(
                      NftStakingConnectedContract.changeBlockReward(newBlockReward)
                  ).to.be.revertedWith("NotOwner()")

                  // if owner, can set new block reward
                  const tx = await nftStaking.connect(deployer).changeBlockReward(newBlockReward)
              })
              it("can change Pool Key (NFT id)", async () => {
                  const newPoolKey = 3
                  // can't access function if not the owner
                  await expect(
                      NftStakingConnectedContract.changePoolKeyToken(newPoolKey)
                  ).to.be.revertedWith("NotOwner()")

                  // if owner, can set new block reward
                  const tx = await nftStaking.connect(deployer).changePoolKeyToken(newPoolKey)
                  const poolKey = await nftStaking.getPoolKeyToken()
                  assert.equal(poolKey, newPoolKey)
                  expect(tx).to.emit(nftStaking, "KeyTokenChanged")
              })
              it("can transfer ownership of the contract", async function () {
                  // can't access function if not the owner
                  await expect(
                      NftStakingConnectedContract.transferOwnership(user2.address)
                  ).to.be.revertedWith("NotOwner()")

                  // if owner, can transfer ownership
                  const tx = await nftStaking.connect(deployer).transferOwnership(user2.address)
                  await tx.wait(1)
                  const newOwner = await nftStaking.owner()
                  assert.equal(newOwner, user2.address)
              })
          })
      })
