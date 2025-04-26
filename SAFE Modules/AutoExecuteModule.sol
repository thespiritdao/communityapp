// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@safe-global/safe-contracts/contracts/interfaces/ISafe.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AutoExecuteModule is Ownable {
    ISafe public safe;

    mapping(address => bool) public allowedRecipients;
    event TransactionExecuted(address indexed recipient, uint256 amount);

    constructor(address _safe) {
        safe = ISafe(_safe);
    }

    function setRecipientApproval(address recipient, bool approved) external onlyOwner {
        allowedRecipients[recipient] = approved;
    }

    function executeTransaction(address recipient, uint256 amount) external {
        require(allowedRecipients[recipient], "Recipient not approved");

        bytes memory data = "";
        bool success = safe.execTransactionFromModule(
            recipient, amount, data, ISafe.Operation.Call
        );

        require(success, "Transaction failed");
        emit TransactionExecuted(recipient, amount);
    }
}
