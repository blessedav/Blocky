// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract RPS {
    address public owner;

    uint256 public minBet = 0.0001 ether; // Минимальная ставка
    enum Move { Rock, Paper, Scissors }

    event GameResult(
        address indexed player,
        Move playerMove,
        Move computerMove,
        string result,
        uint256 amountWon
    );

    constructor() {
        owner = msg.sender;
    }

    // Основная игровая функция
    function play(Move _playerMove) external payable {
        require(msg.value >= minBet, "Bet is too low");

        Move computerMove = randomMove();

        uint256 payout = 0;
        string memory resultText;

        if (_playerMove == computerMove) {
            // Ничья — возвращаем ставку
            payout = msg.value;
            resultText = "Draw";
            _send(payable(msg.sender), payout);

        } else if (
            (_playerMove == Move.Rock && computerMove == Move.Scissors) ||
            (_playerMove == Move.Paper && computerMove == Move.Rock) ||
            (_playerMove == Move.Scissors && computerMove == Move.Paper)
        ) {
            // Победа — удваиваем ставку
            payout = msg.value * 2;
            resultText = "You win!";
            _send(payable(msg.sender), payout);

        } else {
            // Проигрыш — деньги остаются на контракте
            payout = 0;
            resultText = "You lost...";
        }

        emit GameResult(msg.sender, _playerMove, computerMove, resultText, payout);
    }

    // Безопасная отправка через call
    function _send(address payable to, uint256 amount) internal {
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
    }

    // Псевдослучайный ход компьютера
    function randomMove() internal view returns (Move) {
        uint256 rand = uint256(
            keccak256(
                abi.encodePacked(
                    block.timestamp,
                    block.prevrandao,
                    msg.sender
                )
            )
        ) % 3;

        return Move(rand);
    }

    // Вывод средств владельцем
    function withdraw(uint256 amount) external {
        require(msg.sender == owner, "Only owner can withdraw");
        require(amount <= address(this).balance, "Not enough balance");

        _send(payable(owner), amount);
    }

    // Баланс контракта
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
