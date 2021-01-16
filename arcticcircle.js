// Based on https://fedimser.github.io/adt/adt.html

// Configuration
const MAX_ORDER = 1000;
const ANIMATION_ORDER = 100; // Performance: Do not animate from that order on. 
const ANIMATION_DURATION_SEC = 1;
const ANIMATION_PAUSE_SEC = 0.2;
const ANIMATION_FPS = 5;

// Constants to indicate cell status.
const EMPTY = 0;
const INACCESSIBLE = -1;

// Globals
var pixi;
var board;
var animationtimer = null;

// An enum type for the direction a tile wants to move.
// This implies that east- or westmoving tiles are upright, while north- and
// southmoving ones are vertical. So functions for width and height are 
// defined here as well. 
const Direction = Object.freeze({
	NORTH: 1,
	EAST: 2,
	WEST: 3,
	SOUTH: 4,

    dx(dir) {
        switch(dir) {
			case Direction.NORTH:
				return 0;
			case Direction.EAST:
				return +1;
			case Direction.WEST:
				return -1;
			case Direction.SOUTH:
				return 0;
			default:
				return "<invalid direction>";
		}
    },

    dy(dir) {
        switch(dir) {
			case Direction.NORTH:
				return -1;
			case Direction.EAST:
				return 0;
			case Direction.WEST:
				return 0;
			case Direction.SOUTH:
				return +1;
			default:
				return "<invalid direction>";
		}
    },
    
    isHorizontal(dir) {
        switch(dir) {
			case Direction.NORTH:
				return true;
			case Direction.EAST:
				return false;
			case Direction.WEST:
				return false;
			case Direction.SOUTH:
				return true;
			default:
				return "<invalid direction>";
		}
    },

    width(dir) {
        return Direction.isHorizontal(dir) ? 2 : 1;
    },
    
    height(dir) {
        return Direction.isHorizontal(dir) ? 1 : 2;
    },
    
	toStr(dir) {
		switch(dir) {
			case Direction.NORTH:
				return "North";
			case Direction.EAST:
				return "East";
			case Direction.WEST:
				return "West";
			case Direction.SOUTH:
				return "South";
			default:
				return "<invalid direction>";
		}
	}
});

// Tile models a single tile on the board. A tile has a location and 
// an direction it wants to move in. Other properties are a color which is
// determined by the starting position and will never change and information
// on the order the tile was added on, this is used for animation. Also there
// is a flag indicating wether the tile is frozen yet.
class Tile {

    constructor(board, x, y, direction, orderadded) {
        this.board = board;

        this.x = x;
        this.y = y;
        this.orderadded = orderadded;
        this.direction = direction;

        // Determine color.
        var parity = (this.x + this.y + this.board.order) % 2;
        if (Direction.isHorizontal(this.direction)) {
            this.color = parity ? 0x759df9 : 0x82ee70;
        } else {
            this.color = parity ? 0xe3c37b : 0xd47766;
        }

        // Is this a frozen tile?
        var pushingagainst = this.board.map[this.x + Direction.dx(this.direction)][this.y + Direction.dy(this.direction)];
        if (pushingagainst instanceof Tile) {
            this.frozen = (pushingagainst.frozen && pushingagainst.color === this.color);
        } else if (pushingagainst == INACCESSIBLE) {
            this.frozen = true;
        } else {
            this.frozen = false;
        }
    }

    // Are we clashing with a tile that wants to move into us?
    isClashing() {
        var pushingagainst = this.board.map[this.x + Direction.dx(this.direction)][this.y + Direction.dy(this.direction)];
        if (typeof(pushingagainst)=="number") { 
            // Pushes against an empty or inaccessible tile.
            return false;
        } else {
            // Pushes against a tile. Does that push back against us?
            var pushingback = board.map[pushingagainst.x + Direction.dx(pushingagainst.direction)][pushingagainst.y + Direction.dy(pushingagainst.direction)];
            return (pushingback == this);
        }
    }

    drawFull(graphics, alpha, shift) {
        var dx = Direction.dx(this.direction);
        var dy = Direction.dy(this.direction);
    
        var height = Direction.height(this.direction);
        var width =  Direction.width(this.direction);
    
        // Rectangle.
        graphics.lineStyle(0.1, 0x000000, alpha);
        graphics.beginFill(this.color, alpha);
        var x = this.x + dx * shift;
        var y = this.y + dy * shift;
        graphics.drawRect(x, y, width, height);
        graphics.endFill();

        // The arrow.
        var lineColor = this.frozen ? 0x0000ff : 0x000000;
        var isHorizontal = Direction.isHorizontal(this.direction);
        var x0 = isHorizontal ? x + 1 : x + 0.5;
        var y0 = isHorizontal ? y + 0.5 : y + 1;
        graphics.lineStyle(0.02, lineColor, alpha);
        graphics.moveTo(x0 - 0.25 * dx, y0 - 0.25 * dy);
        graphics.lineTo(x0, y0);
        graphics.lineStyle(0.001, lineColor, alpha);
        graphics.beginFill(lineColor, alpha);
        graphics.moveTo(x0 + 0.25 * dx, y0 + 0.25 * dy);
        graphics.lineTo(x0 - 0.1 * dy - 0.05 * dx, y0 - 0.1 * dx - 0.05 * dy);
        graphics.lineTo(x0, y0);
        graphics.lineTo(x0 + 0.1 * dy - 0.05 * dx, y0 + 0.1 * dx - 0.05 * dy);
        graphics.lineTo(x0 + 0.25 * dx, y0 + 0.25 * dy);
        graphics.endFill();
    }

    // No arrows, no border, no animation.
    drawQuick(graphics) {
        graphics.beginFill(this.color, 1);
        graphics.drawRect(this.x, this.y, this.direction.width(), this.direction.height());
        graphics.endFill();
    }

    toStr() {
      return this.x + " " + this.y + " " + Direction.toStr(this.direction);
    }
}

// Board keeps references to all the tiles and maps their positions.
class Board {

    constructor() {
        this.order = 0;

        // Array of tiles. Entries can be EMPTY, INACCESSIBLE or a reference to a Tile 
        this.map = Array(2 * MAX_ORDER);
        for (var i = 0; i < 2 * MAX_ORDER; i++) {
            this.map[i] = Array(2 * MAX_ORDER).fill(INACCESSIBLE);
        }

        this.tiles = [];
        this.tilesRemovedOnLastStep = [];
        
        this.graphics = new PIXI.Graphics();
        pixi.stage.removeChildren();
        pixi.stage.addChild(this.graphics);

        // Animation.
        this.animating = false;
        this.animationFrame = 4.0;     // [0.0 - 4.0].
    }

    draw() {
        this.graphics.clear();

        // Transform to fit into screen.
        var ch = pixi.view.height;
        var cw = pixi.view.width;
        this.graphics.x = cw / 2;
        this.graphics.y = ch / 2;
        this.graphics.pivot.x = MAX_ORDER + 1;
        this.graphics.pivot.y = MAX_ORDER + 1;
        
        var scale = Math.min(100, Math.min(cw, ch) / (2 * this.order));
        this.graphics.scale.x = scale;
        this.graphics.scale.y = scale;

        if (this.order > ANIMATION_ORDER) {
            for (var tile of this.tiles) {
                tile.drawQuick(this.graphics);
            }    
        } else {

            // Draw empty cells.
            var gridAlpha = 1.0;
            if (this.animating && this.animationFrame < 1.0) {
                gridAlpha = this.animationFrame;
            }
            
            this.graphics.lineStyle(0.02, 0x000000, gridAlpha);
            
            for (let x of this.idx) {
                for(let y of this.idx) {
                    if(this.map[x][y]==0 || (this.animating && this.map[x][y]!=-1)) {
                        this.graphics.drawRect(x, y, 1, 1);
                    }
                }
            }

            // Draw Tiles.
            for (var tile of this.tiles) {
                var alpha = 1;
                if (this.animating && tile.orderadded == this.order) {
                    alpha = (this.animationFrame <= 3.0) ? 0 : this.animationFrame - 3;
                }
                var shift = 0;
                if (this.animating && tile.orderadded < this.order && this.animationFrame <= 3.0) {
                    shift = this.animationFrame <= 2.0 ? -1 : this.animationFrame - 3;
                }
                tile.drawFull(this.graphics, alpha, shift);
            }

            // Fade out Tiles removed on last step.
            if (this.animating && this.animationFrame <= 2.0) {
                var alpha = 1;
                if (this.animationFrame >= 1.0) alpha = 2 - this.animationFrame;
                for (var tile of this.tilesRemovedOnLastStep) {
                    tile.drawFull(this.graphics, alpha, 0.0);
                }
            }

        } // of draw animated

        // See https://github.com/pixijs/pixi.js/wiki/v5-Hacks#removing-65k-vertices-limitation
        // This is needed to make PIXI handle large number of shapes.
        this.graphics.finishPoly(); // in case you didnt use closed paths
        this.graphics.geometry.updateBatches();
        this.graphics.geometry._indexBuffer.update(new Uint32Array(this.graphics.geometry.indices));
    }
    
    drawAnimate() {
        if (this.order > ANIMATION_ORDER) {
            this.draw();
            return;
        }

        this.locked = true;
        this.animating = true;
        var interval = 1000 / ANIMATION_FPS;
        var stepIncrement = 4.0 / (ANIMATION_DURATION_SEC * ANIMATION_FPS);
        this.animationFrame = 0.0;
        var drawTimer = setInterval(() => {
            this.animationFrame += stepIncrement;
            if (this.animationFrame >= 4) this.animationFrame = 4;
            this.draw();
            if (this.animationFrame >= 4.0) {
                clearInterval(drawTimer);
                this.locked = false;
                this.animating = false;
            }

        }, interval);
    }

    step() {
        if(this.order == MAX_ORDER) {
            console.log("Max order reached");
            return;
        }

        if(this.locked) {
            return;
        }

        // Step 1. Extend grid.
        this.order += 1;
        this.idx = [];
        for (var i = MAX_ORDER - this.order + 1; i <= MAX_ORDER + this.order; i++) {
            this.idx.push(i);
        }
        this.updateMap();

        // Step 2. Remove clashing Tiles.
        var newTiles = [];
        this.tilesRemovedOnLastStep = []
        for(let tile of this.tiles) {
            if (tile.isClashing()) {
                this.tilesRemovedOnLastStep.push(tile);
            } else {
                newTiles.push(tile);
            }
        }
        this.tiles = newTiles;
        this.updateMap();

        // Step 3. Move Tiles according to their direction.
        for (let tile of this.tiles) {
            tile.x += Direction.dx(tile.direction);
            tile.y += Direction.dy(tile.direction);
        }
        this.updateMap();

        // Step 4. Add Tiles for empty squares.
        for (let x of this.idx) {
            for (let y of this.idx) {
                if (this.map[x][y] == EMPTY) {
                    this.randomFill_(x, y);
                }
            }
        }
        this.updateMap();

        assert(this.tiles.length == this.order * (this.order + 1));
    }

    updateMap() {
        // Clear all accessible cells to EMPTY.
        for (var i = 0; i < this.order; i++) {
            const halfRowLength = this.order - i;
            const y1 = MAX_ORDER - i;
            const y2 = MAX_ORDER + 1 + i;
            const x1 = MAX_ORDER - halfRowLength + 1;
            const x2 = MAX_ORDER + halfRowLength;
            for(var x = x1; x <= x2; x++) {
                this.map[x][y1] = EMPTY;
                this.map[x][y2] = EMPTY;
            }
        }
  
        // Set references to Tiles.
        for (let tile of this.tiles) {
            assert(this.map[tile.x][tile.y] == EMPTY);
            this.map[tile.x][tile.y] = tile;
            if (Direction.isHorizontal(tile.direction)) {
                assert(this.map[tile.x + 1][tile.y] == EMPTY);
                this.map[tile.x + 1][tile.y] = tile;
            } else {
                assert(this.map[tile.x][tile.y + 1] == EMPTY);
                this.map[tile.x][tile.y + 1] = tile;
            }
        }
    }

    // Randomly fills empty 2x2 rectangles with pairs of tiles.
    randomFill_(x, y) {
        assert(this.map[x    ][y]     == EMPTY);
        assert(this.map[x    ][y + 1] == EMPTY);
        assert(this.map[x + 1][y]     == EMPTY);
        assert(this.map[x + 1][y + 1] == EMPTY);

        if (Math.random() <= 0.5) {
            this.addHorTile_(x, y,      Direction.NORTH);
            this.addHorTile_(x, y + 1,  Direction.SOUTH);
        } else {
            this.addVertTile_(x,     y, Direction.WEST);
            this.addVertTile_(x + 1, y, Direction.EAST);
        }
    }

    addHorTile_(x, y, direction) {
        var tile = new Tile(this, x, y, direction, this.order);
        this.tiles.push(tile);
        assert(this.map[x][y]==EMPTY, "Cell occupied: " + this.map[x][y]);
        this.map[x][y]=tile;
        assert(this.map[x+1][y]==EMPTY, "Cell occupied: " + this.map[x+1][y]);
        this.map[x+1][y]=tile;
    }

    addVertTile_(x, y, direction) {
        var tile = new Tile(this, x, y, direction, this.order);
        this.tiles.push(tile);
        assert(this.map[x][y] == EMPTY, "Cell occupied: " + this.map[x][y]);
        this.map[x][y]=tile;
        assert(this.map[x][y+1] == EMPTY, "Cell occupied: " + this.map[x][y+1]);
        this.map[x][y+1]=tile;
    }

} // of class Board

function arcticcircle_step() {
    if (board.locked) return;

    board.step();
    board.drawAnimate();
}

function arcticcircle_run() {
  animationtimer = setInterval(function() { arcticcircle_step(); }, 1000 * ANIMATION_PAUSE_SEC);
  arcticcircle_enable_controls();
}

function arcticcircle_stop() {
    if (animationtimer) {
        clearInterval(animationtimer);
        animationtimer = null;
    }
    arcticcircle_enable_controls();
}

function updateArrows() {
    board.draw();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function arcticcircle_enable_button(btn, enabled)
{
    if (enabled) {
        btn.removeClass("disabled");
    } else {
        btn.addClass("disabled");
    }
}

function arcticcircle_enable_controls() {
    arcticcircle_enable_button(jQuery("#btnRun"),  (!animationtimer));
    arcticcircle_enable_button(jQuery("#btnStop"), (animationtimer));    
    arcticcircle_enable_button(jQuery("#btnStep"), (!animationtimer));    
}

function arcticcircle_wire_controls() {
	console.log("arcticcircle_wire_controls()");
	
	jQuery("#btnNew").click(function() {
        console.log("btnNew");
        arcticcircle_reset();
	});
	
	jQuery("#btnStep").click(function() {
        console.log("btnStep");
        arcticcircle_step()
	});
	
	jQuery("#btnRun").click(function() {
        console.log("btnRun");
        arcticcircle_run();
	});
	
	jQuery("#btnStop").click(function() {
        console.log("btnStop");
        arcticcircle_stop();
	});
}

function arcticcircle_reset() {
    arcticcircle_stop();

    board = new Board();
    board.step();
    board.draw();
    board.updateInfo();
}

function arcticcircle_init() {
	
	// Bootstrap-Stylesheet laden und vorne einklinken. Davon wollen wir vor allem
	// die Stile für Steuerlemente sehen.
	jQuery("<link/>", {
		"rel": 	"stylesheet",
		"type": "text/css",
		"href": "https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css"
	}).prependTo("head");	
	
	// arcticcircle-eigenes Stylesheet laden und hinten einklinken. Das sind Spezialitäten
	// nur für die arcticcircle-Seite.
	jQuery("<link/>", {
		"rel": 	"stylesheet",
		"type": "text/css",
		"href": "arcticcircle.css"
	}).appendTo("head");

	// FontAwesome einbauen
	jQuery("<link/>", {
		"rel": 	"stylesheet",
		"type": "text/css",
		"href": "https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css"
	}).appendTo("head");

    var renderdiv = jQuery("#renderdiv");
    var rendercanvas = jQuery("#rendercanvas");
    
    renderdiv.height(renderdiv.width());
    rendercanvas.width(renderdiv.width()-4);
    rendercanvas.height(renderdiv.height()-4);

    console.log('renderDiv:    ' + renderdiv.width() + ' x ' + renderdiv.height())
    console.log('renderCanvas: ' + rendercanvas.width() + ' x ' + rendercanvas.height())

    pixi = new PIXI.Application({
      antialias: true,
      backgroundColor: 0xffffff, // White.
      view:   rendercanvas[0],
      width:  renderdiv.width(),
      height: renderdiv.height(),
    });
    
    arcticcircle_wire_controls();
    arcticcircle_enable_controls();
    arcticcircle_reset();
}
