// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract GraduateCertificate is ERC721, Ownable {
    using Strings for uint256;

    // Ссылка на папку с метаданными на IPFS
    string public baseURI;
    uint256 public currentTokenId;

    constructor(string memory _initBaseURI) 
        ERC721("GraduateCertificate", "GRAD") 
        Ownable(msg.sender)
    {
        baseURI = _initBaseURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    // Функция для массовой выдачи (Mint)
    // to - массив адресов студентов
    function batchMint(address[] calldata to) public onlyOwner {
        for (uint256 i = 0; i < to.length; i++) {
            _safeMint(to[i], currentTokenId);
            currentTokenId++;
        }
    }
    
    // Возможность обновить ссылку, если ошиблись
    function setBaseURI(string memory _newBaseURI) public onlyOwner {
        baseURI = _newBaseURI;
    }
}