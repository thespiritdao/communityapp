// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract PurchaseBurn {
    IERC20 public immutable systemToken;
    IERC20 public immutable selfToken;
    ERC20Burnable public immutable systemTokenBurnable;
    ERC20Burnable public immutable selfTokenBurnable;

    event PurchaseArtifact(
        address indexed user,
        uint256 systemAmount,
        uint256 selfAmount,
        string productId,
        uint256 timestamp
    );

    constructor(address _systemToken, address _selfToken) {
        require(_systemToken != address(0), "Invalid system token");
        require(_selfToken != address(0), "Invalid self token");
        systemToken = IERC20(_systemToken);
        selfToken = IERC20(_selfToken);
        systemTokenBurnable = ERC20Burnable(_systemToken);
        selfTokenBurnable = ERC20Burnable(_selfToken);
    }

    function purchaseArtifact(
        uint256 systemAmount,
        uint256 selfAmount,
        string calldata productId
    ) external {
        if (systemAmount > 0) {
            require(
                systemToken.allowance(msg.sender, address(this)) >= systemAmount,
                "Insufficient SYSTEM allowance"
            );
            require(
                systemToken.balanceOf(msg.sender) >= systemAmount,
                "Insufficient SYSTEM balance"
            );
            // Transfer SYSTEM tokens to this contract
            require(
                systemToken.transferFrom(msg.sender, address(this), systemAmount),
                "SYSTEM transfer failed"
            );
            // Burn SYSTEM tokens
            systemTokenBurnable.burn(systemAmount);
        }

        if (selfAmount > 0) {
            require(
                selfToken.allowance(msg.sender, address(this)) >= selfAmount,
                "Insufficient SELF allowance"
            );
            require(
                selfToken.balanceOf(msg.sender) >= selfAmount,
                "Insufficient SELF balance"
            );
            // Transfer SELF tokens to this contract
            require(
                selfToken.transferFrom(msg.sender, address(this), selfAmount),
                "SELF transfer failed"
            );
            // Burn SELF tokens
            selfTokenBurnable.burn(selfAmount);
        }

        emit PurchaseArtifact(
            msg.sender,
            systemAmount,
            selfAmount,
            productId,
            block.timestamp
        );
    }
}