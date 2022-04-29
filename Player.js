class Player{
	constructor(name, id, socket, game, host){
		this.name = name;
		this.id = id;
		this.socket = socket;
		this.game = game;
		this.host = host;

		this.role = undefined;
		this.target = undefined;
		this.locked = false;

		this.finalRole = undefined;
		this.numAttackers = 0;
		this.winner = false;
	}

	sendPlayerlist(trigger){
		var playerlistObj = [];
		for(var p of this.game.playerlist){
			playerlistObj.push({username: p.name,
								id: p.id,
								role: ((p.name==this.name && this.game.state=="Game") ? undefined : p.role),
								locked: p.locked,
								target: (this.game.state=="Win" ? p.target : undefined),
								winner: (this.game.state=="Win" ? p.winner : undefined)});
		}
		// console.log(this.game.playerlist);
		// console.log(playerlistObj);
		this.socket.emit('playerlist', {trigger: trigger,
			 							target: this.target,
										winner: (this.game.state=="Win" ? this.winner : undefined),
										host: this.host,
										playerlist: playerlistObj});
	}
}

module.exports = Player;
