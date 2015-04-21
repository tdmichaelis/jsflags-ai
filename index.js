 var port = "8003";
var url = 'http://localhost:' + port;
var socketio = require('socket.io-client');
var socket = socketio(url);
var command;  //socket to send commands on
var initData;
var selectedPlayer;


var connected = false;

var playerSelection;
if (process.argv[2]) {
	playerSelection = parseInt(process.argv[2], 10);
}

// Variables
var enemyBases = [];
var myTanks = [];
var allBases = [];
var myBase = [];
var enemyTanks = [];
var myFlag = [];
var roadBlock = [];
var myColor;
var obstacles;

socket.on("init", function(initD) {
	if (connected) {
		return false;
	}
	socket.on("disconnect", function() {
		//process.exit(1);
	});
	connected = true;
	initData = initD;
	selectedPlayer = initData.players[playerSelection];

	// Set my Color
	myColor = selectedPlayer.playerColor;

	command = socketio(url + "/" + selectedPlayer.namespace);

	enemyBases = initData.players.filter(function(p) {
		return selectedPlayer.playerColor !== p.playerColor;
	});

	myBase = initData.players.filter(function(p) {
		return selectedPlayer.playerColor == p.playerColor;
	})[0].base;

	allBases = initData.players;
		
	var serverTanks = initData.tanks.filter(function(t) {
		return selectedPlayer.playerColor === t.color;
	});

	for (var i = 0; i < serverTanks.length; i++) {
		myTanks.push(new Tank(i));
	}

	setTimeout(function() {
		startInterval();
	}, 2000);

});


/*** AI logic goes after here ***/

/** send back to server **/
function startInterval() {
	setInterval(function() {
		sendBackCommands();
	}, 500);

	setInterval(function() {
		fire();
	}, 500);
}

function sendBackCommands() {
	//add up all calculations
	var speed, angleVel, orders;
	for (var i = 0; i < myTanks.length; i++) {
		speed = myTanks[i].goal.speed * 1;
		angleVel = myTanks[i].goal.angleVel * 1;
		orders = {
			tankNumbers: [myTanks[i].tankNumber], //an array of numbers e.g. [0,1,2,3]
			speed: speed,                         //speed of tank value of -1 to 1, numbers outside of this range will default to -1 or 1, whichever is closer.
			angleVel: angleVel                    //turning speed of tank positive turns right, negative turns left
		}
		command.emit("move", orders);
	}
}

function fire() {
	var orders = {
		tankNumbers: [0,1,2,3]
	}
	command.emit("fire", orders);
}

/** recieve from server **/
socket.on("refresh", function(gameState) {
	var myTanksNewPosition = gameState.tanks.filter(function(t) {
		return selectedPlayer.playerColor === t.color;
	});

	test = gameState.flags.filter(function(t) {
		if(selectedPlayer.playerColor !== t.color && t.tankToFollow !== null) {
			var enemyFlag = t.position;
		} else {
			return;
		}
	});

	if (gameState.boundaries.length > 0) {
		calculateObstacle(gameState.boundaries);
	}

	updateMyTanks(myTanksNewPosition);
	calculateGoal();
	
});

function updateMyTanks (myTanksNewPosition) {
	for (var i = 0; i < myTanks.length; i++) {
		for (var j = 0; j < myTanksNewPosition.length; j++) {
			if (myTanks[i].tankNumber === myTanksNewPosition[j].tankNumber) {

				//Brett Code
				if(Math.abs(myTanks[i].position.x - myTanksNewPosition[j].position.x) == 0 && Math.abs(myTanks[i].position.y - myTanksNewPosition[j].position.y) == 0 ) {

					myTanks[i].stuck = !myTanks[i].stuck;

				}
				//End Brett Code

				// Avoid the Obstacles
				for (var k = 0; k < obstacles.length; k++) {
					if(Math.abs(myTanks[i].position.x - obstacles[k].position.x) <= 30 && Math.abs(myTanks[i].position.y - obstacles[k].position.y) <= 30 ) {

						myTanks[i].stuck = !myTanks[i].stuck;

					}
				}

				myTanks[i].position = myTanksNewPosition[j].position;
				myTanks[i].angle = myTanksNewPosition[j].angle;
				myTanks[i].hasFlag = myTanksNewPosition[j].hasFlag;
			}
		}
	}
}

function calculateGoal() {
	var distance = 0;
	var angle = 0;
	var degrees = 0;
	var relativeX = 0;
	var relativeY = 0;
	var angleDifference = 0;

	for (var i = 0; i < myTanks.length; i++) {
		if (myTanks[i].hasTarget()) {
			goal = myTanks[i].getTarget();
		} else {
			goal = myTanks[i].generateTarget();
		}
		//find distance to goal
		distance = round(Math.sqrt(Math.pow(( goal.x - myTanks[i].position.x ), 2) + Math.pow(( goal.y - myTanks[i].position.y ), 2)), 4);

		//find angle difference to face goal
		relativeX = goal.x - myTanks[i].position.x;
		relativeY = goal.y - myTanks[i].position.y;
		angle = round(Math.atan2(-(relativeY), relativeX), 4);
		degrees = round(angle * (180 / Math.PI), 4);  //convert from radians to degrees
		degrees = -(degrees); // tank degrees ascends clockwise. atan2 ascends counter clockwise. this fixes that difference

		//turn in the direction whichever is closer
		if (degrees < 0) {
			degrees = (degrees + 360) % 360;
		}

		angleDifference = myTanks[i].angle - degrees;

		if (angleDifference > 0) {
			if (angleDifference < 180) {
				myTanks[i].goal.angleVel = -1;
			} else {
				myTanks[i].goal.angleVel = 1;
			}
		} else {
			if (angleDifference > -180) {
				myTanks[i].goal.angleVel = 1;
			} else {
				myTanks[i].goal.angleVel = -1;
			}
		}

		//set speed
		if (distance >= 10) {
			myTanks[i].goal.speed = 1;
		} else {
			//myTanks[i].goal.speed = 0;
			myTanks[i].missionAccomplished();
		}
		// Brett Code
		if(myTanks[i].stuck) {
			myTanks[i].backup();
		}
		// End Brett code
	}
}

function calculateObstacle(obstacle) {
	obstacles = obstacle;
}





/*** TANK ***/
var Tank = function(tankNumber) {
	this.tankNumber = tankNumber;
	this.tankColor = selectedPlayer.playerColor;
	this.position = {x: 0, y: 0};
	this.angle;
	this.goal = {
		speed: 0,
		angleVel: 0
	};
	this.avoidObstacle = {
		speed: 0,
		angleVel: 0
	};
	this.hasFlag = false;
	this.target = {x: 100, y: 100};
	this.hasATarget = false;
	this.stuck = false;
};

Tank.prototype = {
	getTarget: function() {
		
		if(this.hasFlag) {
			this.runHome();
		} else {
			this.attack();
		}

	},
	hasTarget: function() {
		return this.hasATarget;
	},
	generateTarget: function() {

		if(this.hasFlag) {
			return this.runHome();
		} else {
			return this.attack();
		}

	},
	missionAccomplished: function() {
		this.hasATarget = false;
	},
	runHome: function() {
		return myBase.position;
	},
	attack: function() {
		if(typeof enemyFlag != 'undefined') {
			this.target = enemyFlag;
		} else {
			this.target = enemyBases[0].base.position;
		}
		return this.target;
	},
	wander: function() {
		var randomNumber = Math.floor(Math.random() * 10 % enemyBases.length); //random num between 0 and enemyBases.length
		this.target = enemyBases[randomNumber].base.position;
	},
	// Brett Code
	backup: function() {
		this.goal.speed = -1;
		this.goal.angleVel = 0;
		this.stuck = false;
	},
	avoidObstacle: function() {
		for (var i = 0; i < obstacles.length; i++) {
			if(Math.abs(this.position.x - obstacles[i].position.x) <= 30 && Math.abs(this.position.y - obstacles[i].position.y) <= 30 )
			if(this.position.x ) {

			}
		}
	}
	// End Brett Code
};


//rounds number (value) to specified number of decimals
function round(value, decimals) {
    return Number(Math.round(value+'e'+decimals)+'e-'+decimals);
}


