// -------------------------------------------------
// CJKnob V0.1.1
// STARTED DATE  19-06-2013 || END DATE 00-07-2013
// UPDATED DATE  30-06-2022 - Fixed bug
// https://github.com/tanghoong/cj-knob
// -------------------------------------------------
(function ($) {
	$.fn.extend({
		cjknob: function (obj) {
			var defaults = {
				// Option
				mode: 'sknob', // default {sknob,dknob,gauge}
				showMeter: true, // default
				// Color
				bgcolor: '#D2D2D2', // Background color for the path which not overlay
				cBenchmark: '#94CEFE', // Color of Benchmark
				cColor: '#019AE6', // '#B30000' or 'red', default is serials color which in re-use
				// Digit
				cBenchmarkD: '50', // Expected mimimun of Benchmark
				height: '220',
				width: '220',
				// String
				cClass: 'cjknob', // Addition class, multiple then just add space
				meterTitle: '',
				meterFont: '1rem Arial',
				cjIcon: 'images/icons/sun-svgrepo-com.svg'
			};
			var o = $.extend(defaults, obj);
			// -------------------------------------------------
			// DO ONCE FUNCTION
			// -------------------------------------------------
			// Variables
			var canvasID = $(this).attr('id');
			var data = $(this).text();
			var data2 = 0;
			var mode = o.mode;
			var ctx = null;
			if (data > 100) {
				data2 = data - 100;
				mode = 'dknob';
			}
			var knobCanvas = canvasID + '-canvas';
			var knobIcon = canvasID + '-icon';

			if ($(`#${canvasID}`).html() != '') { // dump html to it
				var degrees = 0,
					new_degrees = 0,
					difference = 0;
				var degrees2 = 0,
					new_degrees2 = 0,
					difference2 = 0;
				var animation_loop, animation_loop2;
				$(this).html('<img id="' + knobIcon + '"src="' + o.cjIcon + '" style="width:24%;"/>' + '<canvas id="' + knobCanvas + '" width="' + o.width + '" height="' + o.height + '"></canvas>');

				// Element Set Style
				var wrapper = $(`#${canvasID}`);
				var canvas = $(`#${knobCanvas}`);
				var icon = $(`#${knobIcon}`);

				wrapper.css({
					'position': 'relative',
				});
				//dimensions
				var W = o.width;
				var H = o.height - 50;
				var W_icon = 24;
				var H_icon = 24;
				icon.css({
					'position': 'absolute',
					'top': '40%',
					'left': '50%',
					'margin-top': '-' + H_icon / 2 + '%',
					'margin-left': '-' + W_icon / 2 + '%',
				});
			}
			ctx = canvas[0].getContext("2d");

			function init() {
				// Clear the canvas everytime a chart is drawn
				ctx.clearRect(0, 0, W, H);

				// Background 360 degree arc, Part 1
				ctx.beginPath();
				ctx.strokeStyle = o.bgcolor;
				ctx.lineWidth = 10;
				ctx.arc(W / 2, H / 2 + 30, 80, 0, Math.PI * 2, false); //you can see the arc now
				ctx.stroke();
				if (mode == 'dknob') {
					//Background 360 degree arc, Part 2
					ctx.beginPath();
					ctx.strokeStyle = o.bgcolor;
					ctx.lineWidth = 5;
					ctx.arc(W / 2, H / 2 + 30, 90, 0, Math.PI * 2, false); //you can see the arc now
					ctx.stroke();
				}
				//Benchmark Background Color
				//Angle in radians = angle in degrees * PI / 180
				var radians2 = o.cBenchmarkD * Math.PI * 2 / 100;
				ctx.beginPath();
				ctx.strokeStyle = o.cBenchmark;
				ctx.lineWidth = 10;
				ctx.arc(W / 2, H / 2 + 30, 80, 0 - 90 * Math.PI / 180, radians2 - 90 * Math.PI / 180, false); //you can see the arc now
				ctx.stroke();

				//gauge will be a simple arc
				//Angle in radians = angle in degrees * PI / 180
				var radians = degrees * Math.PI / 180;
				ctx.beginPath();
				ctx.strokeStyle = o.cColor;
				ctx.lineWidth = 10;
				//The arc starts from the rightmost end. If we deduct 90 degrees from the angles
				//the arc will start from the topmost end
				ctx.arc(W / 2, H / 2 + 30, 80, 0 - 90 * Math.PI / 180, radians - 90 * Math.PI / 180, false);
				//you can see the arc now
				if (Math.round(parseInt(data) / 100 * 360) >= 1) {
					ctx.stroke();
				}
				if (mode == 'dknob' && Math.round(parseInt(degrees) * 100 / 360) >= 100) {

					var radians2 = degrees2 * Math.PI / 180;
					ctx.beginPath();
					ctx.strokeStyle = o.cColor;
					ctx.lineWidth = 5;
					ctx.arc(W / 2, H / 2 + 30, 90, 0 - 90 * Math.PI / 180, radians2 - 90 * Math.PI / 180, false);
					if (Math.round(parseInt(data2) / 100 * 360) >= 1) {
						ctx.stroke();
					}

				}

				//Lets add the text
				ctx.fillStyle = '#000';
				ctx.font = o.meterFont;
				text = Math.ceil(degrees / 360 * 100);
				//Lets center the text
				//deducting half of text width from position x
				text_width = ctx.measureText(text).width;
				//adding manual value to position y since the height of the text cannot
				//be measured easily. There are hacks but we will keep it manual for now.
				ctx.fillText(text + '%', W / 2 - text_width / 2 - 10, H / 2 + 80);

			}

			function draw(data) {
				//Cancel any movement animation if a new chart is requested
				if (typeof animation_loop != undefined) clearInterval(animation_loop);
				if (typeof animation_loop2 != undefined) clearInterval(animation_loop2);

				//degree from 0 to 360
				new_degrees = Math.round(parseInt(data) / 100 * 360);
				new_degrees2 = Math.round(parseInt(data2) / 100 * 360);
				console.log(data);
				console.log(data2);
				difference = new_degrees - degrees;
				difference2 = new_degrees2 - degrees2;
				animation_loop = setInterval(animate_to, 500 / difference);
				animation_loop2 = setInterval(animate_to, 500 / difference2);
			}

			//function to make the chart move to new degrees
			function animate_to() {
				//clear animation loop if degrees reaches to new_degrees
				if (degrees == new_degrees) {
					clearInterval(animation_loop);
				}
				if (degrees < new_degrees) {
					degrees++;
					if (degrees > 360) {
						if (degrees2 < new_degrees2)
							degrees2++;
					}
				} else {
					degrees--;
					if (degrees < 360) {
						if (degrees2 > new_degrees2)
							degrees2--;
					}
				}
				if (degrees2 == new_degrees2) {
					clearInterval(animation_loop2);
				}


				init();
			}

			//Lets add some animation for fun
			draw(data);
		} // End: cjknob()
	});
})(jQuery);
// -------------------------------------------------
// FUNCTION FOR PLUGIN TO USE
// -------------------------------------------------