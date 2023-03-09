// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

error NotOwner(string message);
error ContractPaused(string message);

contract GardenNFT is ERC1155 {

    /* ========== VARIABLES ========== */

    address public owner;
    uint public mintPrice;
    uint internal treasury;
    bool public _paused;

    /* ========== MODIFIERS ========== */

    modifier onlyOwner(){
        if (msg.sender != owner) {
            revert NotOwner("Only the contract owner can perform this action");
        }
        _;
    }
    // In case of emergency sets contract on pause
    modifier onlyWhenNotPaused() {
        if(_paused){
            revert ContractPaused("Contract is currently paused");
        }
        _;
    }

    constructor(uint _mintPrice) ERC1155("ipfs://bafybeicqbmxfuravq37oy4k5cc5a7yh3ajxko4smtl5ocfwf7swf7vceiy") {
        owner = msg.sender;
        mintPrice = _mintPrice;
    }

    /**
     * @param id - token ID
     * @param numberOfTokens - amount of NFTs to mint
     */
    function mint(uint256 id, uint256 numberOfTokens) public payable onlyWhenNotPaused {
        require(numberOfTokens != 0, "You need to mint at least 1 token");
        require(msg.value >= (numberOfTokens * mintPrice), "Not enough Ether sent.");

        treasury += (numberOfTokens * mintPrice);

        _mint(msg.sender, id, numberOfTokens, "");
    }

   
    function getMintPrice () public view returns (uint256) {
        return mintPrice;
    }

    /* ========== ONLY-OWNER ========== */

    function setURI(string memory newuri) public onlyOwner {
        _setURI(newuri);
    }

    /**
     * @dev pause contract in case of emergency
     */
    function setPaused(bool val) public onlyOwner {
        _paused = val;
    }

    function transferOwnership (address newOwner) public onlyOwner {
        require(newOwner != address(0), "New owner address cannot be zero address");
          owner = newOwner;
    }

    /**
     * @dev withdraw fees from the contract
     */
   

    function _collectFee() private onlyOwner {
    require(treasury > 0, "Treasury is empty");
    uint256 amount = treasury;
    treasury = 0;
    (bool success, ) = address(this).call{value: amount}("");
    require(success, "Transfer failed");
}

function withdraw() public onlyOwner {
    _collectFee();
}



}
