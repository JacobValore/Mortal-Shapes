const Player = require('./Player.js');

class Game{
	constructor(id, io, private_game){
		//Game Settings
		this.private_game = private_game;
		this.max_players = 3;

		//Game Setup
		this.id = id;
		this.io = io;
		this.playerlist = [];
		this.state = "Lobby";

		this.availableIDs = [0,1,2];

		// this.module_timer = null;
		// this.timer_interval = null;
	}

	addPlayer(username, socket){
		console.log("player recieved");
		var game = this;
		username = game.assignUsername(username);
		var player = new Player(username, game.availableIDs.shift(), socket, game, game.playerlist.length==0);
		player.socket.join(game.id);
		if(game.state == "Lobby" && game.playerlist.length < 3)
			game.playerlist.push(player);
		game.sendMessage("Server", player.name+" has connected.");
		game.sendPlayerlist("Join");
		if(game.playerlist.length == 3)
			game.sendStartButton();

		//Commands List
		socket.on('start-game', function(){
			console.log("start-game received");
			if(game.state == "Lobby" && player.host && game.playerlist.length == 3){
				game.state = "Game";
				game.setupGame();
				game.sendPlayerlist("Start");
			}
			else if(game.state == "Win"){
				game.state = "Lobby";
				game.sendResetGame();
				game.sendPlayerlist("Reset");
				game.sendStartButton();
			}
		});
		socket.on('target', function(data){
			console.log("target received");
			console.log(data);
			if(game.state == "Game" && data.noTarget){
				player.target = undefined;
				player.sendPlayerlist("Target");
			}
			if(game.state == "Game" && data.target>=0 && data.target<=2 && data.target!=player.id){
				player.target = data.target;
				player.sendPlayerlist("Target");
			}
			console.log("info:");
			console.log(data.target!=player.id);
			console.log(player.id);
			console.log(player.target);
		});
		socket.on('locked', function(){
			console.log("locked received");
			if(game.state == "Game"){
				player.locked = !player.locked;
				game.sendPlayerlist("Lock");
			}
			for(var p of game.playerlist){
				if(!p.locked)
					return;
			}
			game.state = "Win";
			game.findWinners();
			game.sendPlayerlist("Win");
			game.sendStartButton();
		});
		socket.on('chat-message', function(data){
			console.log("chat-message received");
			game.sendMessage(player.name,data.message);
		})
		socket.on('disconnect', function() {
			game.sendMessage("Server",player.username+" has disconnected.");
			game.availableIDs.push(player.id);
			if(game.state == "Lobby"){
				game.remove(game.playerlist,player);
				game.sendPlayerlist("Disconnect");
			}
			else{
				//Restart game to Lobby?
			}
		});
	}

	//Sending Functions
	sendMessage(username, message){
		this.io.to(this.id).emit('chat-message', {"username":username,"message":message});
	}
	sendPlayerlist(trigger){
		for(var p of this.playerlist){
			p.sendPlayerlist(trigger);
		}
	}
	sendStartButton(){
		for(var p of this.playerlist){
			if(p.host)
				p.socket.emit('show-host-start');
		}
	}
	sendResetGame(){
		for(var p of this.playerlist){
			p.role = undefined;
			p.target = undefined;
			p.locked = false;

			p.finalRole = undefined;
			p.numAttackers = 0;
			p.winner = false;
		}
		this.io.to(this.id).emit('reset-game');
	}

	// Helper Functions
	setupGame(torus=false,mystics=false){
		var roleList = ["pyramid","pyramid","pyramid","cube","cube","cube"];
		if(torus)
			roleList.push("torus");
		if(mystics)
			roleList = roleList.concat(["mystic-pyramid","mystic-cube"]);
		this.shuffle(roleList);
		for(var p of this.playerlist){
			p.role = roleList.pop();
			p.target = undefined;
			p.locked = false;
			p.finalRole = undefined;
			p.numAttackers = 0;
			p.winner = false;
			if(p.role == "mystic-pyramid" || p.role == "pyramid")
				p.finalRole = "pyramid";
			if(p.role == "mystic-cube" || p.role == "cube")
				p.finalRole = "cube";
		}
	}
	findWinners(){
		console.log("finding winners");

		//TORUS
		if(this.checkForTorus()){
			this.doTorusWinCondition();
			return;
		}
		//IF NO TORUS, THEN ONLY ROLES MATTER
		this.setFinalRoles();
		var idKilled = this.getIdKilled();

		if(idKilled == undefined){
			console.log("do not kill win cond");
			this.doNoKillWinCondition();
			return;
		}

		var roleKilled = this.getRoleKilled(idKilled);
		this.doRoleKilledWinCondition(roleKilled);
	}
	checkForTorus(){
		for(var p of this.playerlist){
			if(p.role == 'torus')
				return true;
		}
	}
	doTorusWinCondition(){
		for(var p of this.playerlist){
			//CHECK TORUS WIN CONDITION
			if(p.role == "torus"){
				if(p.target==undefined){
					//If TORUS doesn't attack, they WIN
					p.winner = true;
					return;
				}
				else{
					//TORUS and TORUS's TARGET: LOSE
					//OTHER PERSON: WIN
					for(var p2 of this.playerlist){
						if(p2.name != p.name && p2.id != p.target)
							p2.winner = true;
					}
					return;
				}
			}
		}
	}
	setFinalRoles(){
		for(var p of this.playerlist){
			//Will switch the role twice if both in game
			if(p.role == "mystic-pyramid" || p.role == "mystic-cube"){
				for(var p2 of this.playerlist){
					if(p2.finalRole == "pyramid")
						p2.finalRole = "cube";
					else if(p2.finalRole == "cube")
						p2.finalRole = "pyramid";
				}
			}
		}
	}
	getIdKilled(){
		var attackedList = [0,0,0];
		for(var p of this.playerlist){
			if(p.target!=undefined)
				attackedList[p.target]++;
		}
		return (attackedList.includes(2) || this.sum(attackedList)==1) ? this.maxValIndex(attackedList) : undefined;
	}
	getRoleKilled(idKilled){
		if(idKilled == undefined)
			return undefined;
		for(var p of this.playerlist){
			if(p.id == idKilled)
				return p.finalRole;
		}
	}
	doNoKillWinCondition(){
		var numFinalCubes = 0;
		for(var p of this.playerlist){
			if(p.finalRole == "cube")
				numFinalCubes++;
		}
		for(var p of this.playerlist){
			if(numFinalCubes==3||numFinalCubes==0) //All same role
				p.winner = true;
			else if(numFinalCubes==2 && p.finalRole=="pyramid") //Minority win
				p.winner = true;
			else if(numFinalCubes==1 && p.finalRole=="cube") //Minority win
				p.winner = true;
		}
	}
	doRoleKilledWinCondition(roleKilled){
		for(var p of this.playerlist){
			if(roleKilled == "pyramid" && p.finalRole=="cube")
				p.winner = true;
			else if(roleKilled == "cube" && p.finalRole=="pyramid")
				p.winner = true;
		}
	}

	//Username Functions
	assignUsername(username){
		if(username==null)
			username="";
		username = username.trim();
		// username = username.substring(0, 10);
		var curnames = [];
		for(var i = 0; i < this.playerlist.length; i++)
			curnames.push(this.playerlist[i].name);
		if(username=="")
			return this.anonUsername(curnames).trim();
		if(curnames.includes(username)){
			if(username.startsWith("Anon"))
				return this.anonUsername(curnames).trim();
			else
				return this.usernamePlusOne(curnames,username).trim();
		}
		return username.trim();
	}
	anonUsername(curnames){
		var data = fs.readFileSync(__dirname+'/animals.txt', 'utf8').split("\n");
		var animal = "";
		var username = "Anon";
		while(animal==""||animal==null||curnames.includes(username+animal)){
			animal = data[Math.floor(Math.random() * data.length)];
		}
		return username+animal;
	}
	usernamePlusOne(curnames,username){
		username = username.substring(0, 9);
		if(!curnames.includes(username))
			return username;
		var i=1;
		while(curnames.includes(username+i))
			i++;
		return username+i;
	}

	//Array Functions
	shuffle(array) {
		var currentIndex = array.length, temporaryValue, randomIndex;
		//While there remain elements to shuffle
		while (0 != currentIndex) {
			//Pick a remaining element
			randomIndex = Math.floor(Math.random() * currentIndex);
			currentIndex -= 1;
			//And swap it with the current element
			temporaryValue = array[currentIndex];
			array[currentIndex] = array[randomIndex];
			array[randomIndex] = temporaryValue;
		}
		return array;
	}
	remove(array, element) {
		var index = array.indexOf(element);
		if (index != -1)
			array.splice(index, 1);
	}
	sum(array){
		return array.reduce(function(t,n){return t+n});
	}
	maxValIndex(array){
		if (array.length === 0) {
	        return -1;
	    }
	    var max = array[0];
	    var maxIndex = 0;
	    for (var i = 1; i < array.length; i++) {
	        if (array[i] > max) {
	            maxIndex = i;
	            max = array[i];
	        }
	    }
	    return maxIndex;
	}
}

module.exports = Game;

// var attackedList = [0,0,0];
// for(var p of this.playerlist){
	// //CHECK TORUS WIN CONDITION
	// if(p.role == "torus"){
	// 	if(p.target==undefined){
	// 		//If TORUS doesn't attack, they WIN
	// 		p.winner = true;
	// 		return;
	// 	}
	// 	else{
	// 		//TORUS and TORUS's TARGET: LOSE
	// 		//OTHER PERSON: WIN
	// 		for(var p2 of this.playerlist){
	// 			if(p2.name != p.name && p2.id != p.target)
	// 				p2.winner = true;
	// 		}
	// 		return;
	// 	}
	// }
	//ALSO GET EVERYONE'S FINAL ROLE
	// if(p.role == "mystic-pyramid" || p.role == "mystic-cube"){ //Will switch the role twice if both in game
	// 	for(var p2 of this.playerlist){
	// 		if(p2.finalRole == "pyramid")
	// 			p2.finalRole = "cube";
	// 		else if(p2.finalRole == "cube")
	// 			p2.finalRole = "pyramid";
	// 	}
	// }
	//ALSO SET NUMBER OF ATTACKERS
// 	if(p.target!=undefined){
// 		attackedList[p.target]++;
// 	}
// }
//CALCULATE WHO WINS FROM FINAL ROLES
// var idKilled = (attackedList.includes(2) || this.sum(attackedList)==1) ? this.maxValIndex(attackedList) : undefined;
// var roleKilled = undefined;
// if(idKilled = undefined){ //Nobody is Killed
// 	var numFinalCubes = 0;
// 	for(var p of this.playerlist){
// 		if(p.id == idKilled)
// 			roleKilled = p.finalRole;
// 		if(p.finalRole == "cube")
// 			numFinalCubes++;
// 	}
// 	for(var p of this.playerlist){
// 		if(numFinalCubes==3||numFinalCubes==0) //All same role
// 			p.winner = true;
// 		else if(numFinalCubes==2 && p.finalRole=="pyramid") //Minority win
// 			p.winner = true;
// 		else if(p.finalRole=="cube")//Minority win
// 			p.winner = true;
// 	}
// 	return;
// }
//IF SOMEBODY KILLED, WHO? IF PYRAMID, cubes win. IF CUBE, pyramids win.
// for(var p of this.playerlist){
// 	if(roleKilled == "pyramid" && p.finalRole=="cube")
// 		p.winner = true;
// 	else if(roleKilled == "cube" && p.finalRole=="pyramid")
// 		p.winner = true;
// }
