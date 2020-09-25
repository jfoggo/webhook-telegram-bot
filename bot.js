const req = require("request");

class Bot {
	constructor(options){
		this.API_URL = "https://api.telegram.org/bot"+options.API_TOKEN+"/";
		this.BOT_NAME = options.BOT_NAME;
		this.known_events = ["text","animation","audio","document","photo","sticker","video","video_note","voice","location","inline_query","callback_query"];
		this.events = {};
		this.commands = {};
		this.options = options;
	}
	on(event,callback){
		if (this.known_events.indexOf(event) !== -1) {
			this.events[event] = callback;
		}
		else this.commands[event] = callback;
	}
	off(event){
		if (this.events[event]) delete this.events[event];
		else if (this.commands[event]) delete this.commands[event];
	}
	handleUpdate(data){
		// Helper functions
		function getUpdateType(data){
			var types = ["message","edited_message","channel_post","edited_channel_post","inline_query","callback_query"];
			for (var i=0;i<types.length;i++){
				if (data[types[i]]) return types[i];
			}
		}
		function getMessageType(msg,known_events){
			for (var i=0;i<known_events.length;i++){
				if (msg[known_events[i]]) return known_events[i];
			}
		}
		function matchCommands(text,commands,BOT_NAME){
			for (var cmd in commands){
				var noAt = text.replace("@"+BOT_NAME,"");
				if (text.match(cmd) || (text.match(".*@"+BOT_NAME) && noAt.match(cmd))) return cmd;
			}
		}
		console.log("[INFO] Received update: ",data);

		// Return Promise
		return new Promise((resolve,reject)=>{
			// Check for valid/known update type
			var updateType = getUpdateType(data);
			console.log("[INFO] Update type: "+updateType);

			// Handle messages
			if (updateType == "message" || updateType == "edited_message" || updateType == "channel_post" || updateType == "edited_channel_post"){
				var msg = data[updateType];
				var msgResult;
				// Check for valid/known message type
				var msgType = getMessageType(msg,this.known_events);
				var cmdType = matchCommands(msg.text,this.commands,this.BOT_NAME);
				console.log("[INFO] Message type: ",msgType);
				// Check for commands
				if (msgType == "text" && cmdType) {
					console.log("[INFO] Executing callback");
					// Execute callback
					try { msgResult = this.commands[cmdType](msg); }
					catch(err) { reject(err); }
				}
				// Check if event handler exists for message type
				else if (this.events[msgType] !== undefined) {
					console.log("[INFO] Executing callback");
					// Execute callback
					try { msgResult = this.events[msgType](msg); }
					catch(err) { reject(err); }
				}
				// Handle unsupported message types
				else reject(new Error("Unsupported message type: "+msgType));
				console.log("[INFO] Processing callback result");

				// Process callback result (string)
				if (typeof msgResult === "string" || msgResult instanceof String){
					console.log("[INFO] Callback result: ",msgResult);
					resolve({
						method: "sendMessage",
						chat_id: msg.chat.id,
						text: msgResult,
						reply_to_message_id: msg.message_id
					});
				}
				// Process callback result (Promise)
				else if (msgResult instanceof Promise){
					msgResult
						.then(res => {
							console.log("[INFO] Callback result: ",res);
							var keyboard = [];
							for (var i=0;res instanceof Array && i<res.length;i++){
								var arr = [];
								for (var j=0;j<8 && i<res.length;j++){
									arr.push({
										text: res[i],
										callback_data: res[i]
									});
									i++;
								}
								keyboard.push(arr);
								i--;
							}
							resolve(typeof res === "string" || res instanceof String ? {
								method: "sendMessage",
								chat_id: msg.chat.id,
								text: res,
								reply_to_message_id: msg.message_id
							} : (res instanceof Array ? {
								method: "sendMessage",
								chat_id: msg.chat.id,
								reply_to_message_id: msg.message_id,
								reply_markup: {
									inline_keyboard: keyboard
								}
							} : (res instanceof Object ? res : "")));
						})
						.catch(err => reject(err));
				}
				else if (msgResult instanceof Array){
					console.log("[INFO] Callback result: ",msgResult);
					var keyboard = [];
					for (var i=0;i<msgResult.length;i++){
						var arr = [];
						for (var j=0;j<8 && i<msgResult.length;j++){
								arr.push({
									text: msgResult[i],
									callback_data: msgResult[i]
								});
							i++;
						}
						keyboard.push(arr);
						i--;
					}
					resolve({
						method: "sendMessage",
						chat_id: msg.chat.id,
						text: "Click the button(s)",
						reply_to_message_id: msg.message_id,
						reply_markup: {
							inline_keyboard: keyboard
						}
					});
				}
				else if (msgResult instanceof Object){
					resolve(msgResult);
				}
				// Ignore other callback result types
				else resolve("");
			}
			// Handle inline-query
			else if (updateType == "inline_query"){
				// Check if event handler exists
				if (this.events[updateType]) {
					// Execute callback
					try {
						var inlineResult = this.events[updateType](data[updateType]);
					}
					catch(err) { reject(err); return; }

					// Process callback result (string)
					if (typeof inlineResult === "string" || inlineResult instanceof String){
						console.log("[INFO] Callback result: ",inlineResult);
						resolve({
							method: "answerInlineQuery",
							inline_query_id: data[updateType].id,
							results: [
								{
									type: "document",
									id: 1234,
									title: inlineResult,
									caption: inlineResult
								}
							]
						});
					}
					// Process callback result (Promise)
					else if (inlineResult instanceof Promise){
						inlineResult
							.then(res => resolve(typeof res === "string" || res instanceof String ? { // Process promise callback result (string)
								method: "answerInlineQuery",
								inline_query_id: data[updateType].id,
								results: [
									{
										type: "document",
										id: 1234,
										title: res,
										caption: res
									}
								]
							}:(res instanceof Array ? { // Process promise callback result (Array)
								method: "answerInlineQuery",
								inline_query_id: data[updateType].id,
								results: res.map((txt,i)=>({
									type: "document",
									id: i,
									title: txt,
									caption: txt
								}))
							} : (res instanceof Object ? res : ""))))
							.catch(err => reject(err));
					}
					// Parse callback result (Array)
					else if (inlineResult instanceof Array){
						resolve({
							method: "answerInlineQuery",
							inline_query_id: data[updateType].id,
							results: inlineResult.map((txt,i) => ({
								type: "document",
								id: i,
								title: txt,
								caption: txt
							}))
						});
					}
					else if (inlineResult instanceof Object) resolve(inlineResult);
					else resolve("");
				}
				else reject(new Error("Unsupported event: "+updateType));
			}
			// Handle callback-query
			else if (updateType == "callback_query"){
				if (this.events[updateType]) {
					// Execute callback
					try {
						var cbResult = this.events[updateType](data[updateType]);
					}
					catch(err) { reject(err); return; }

					// Process callback result (string)
					if (typeof cbResult === "string" || cbResult instanceof String){
						resolve({
							method: "answerCallbackQuery",
							callback_query_id: data[updateType].id,
							text: cbResult
						});
					}
					// Process callback result (promise)
					else if (cbResult instanceof Promise){
						cbResult
							.then(res => resolve(typeof res === "string" || res instanceof String ? {
								method: "answerCallbackQuery",
								callback_query_id: data[updateType].id,
								text: res
							}:(res instanceof Object ? res : "")))		// TODO: Add Button support (instanceof Array)
							.catch(err => reject(err));
					}
					/* else if (cbResult instanceof Array) {
						... TODO ...
					}*/
					else if (cbResult instanceof Object) resolve(cbResult);
					else resolve("");
				}
				else reject(new Error("Unsupported event: "+updateType));
			}
			// Handle other/unknown update types
			else {
				reject(new Error("Unknown update type: "+updateType));
			}
		});
	}
	sendMessage(type,chat_id,text,file_id,reply_to,parse_mode,lon,lat){
		return new Promise((resolve,reject)=>{
			var url = this.API_URL;
			// Create URL, add method type and query parameter
			if (type == "text"){
				url += "sendMessage?";
				url += "chat_id="+encodeURIComponent(chat_id);
				url += "&text="+encodeURIComponent(text);
				if (reply_to) url += "&reply_to_message_id="+encodeURIComponent(reply_to);
				if (parse_mode) url += "&parse_mode="+parse_mode;
			}
			else if (type == "animation"){
				url += "sendAnimation?";
				url += "chat_id="+encodeURIComponent(chat_id);
				url += "&animation="+encodeURIComponent(file_id);
				if (text) url += "&caption="+encodeURIComponent(text);
				if (reply_to) url += "&reply_to_message_id="+encodeURIComponent(reply_to);
				if (parse_mode) url += "&parse_mode="+parse_mode;
			}
			else if (type == "audio"){
				url += "sendAudio?";
				url += "chat_id="+encodeURIComponent(chat_id);
				url += "&audio="+encodeURIComponent(file_id);
				if (text) url += "&caption="+encodeURIComponent(text);
				if (reply_to) url += "&reply_to_message_id="+encodeURIComponent(reply_to);
				if (parse_mode) url += "&parse_mode="+parse_mode;
			}
			else if (type == "document"){
				url += "sendDocument?";
				url += "chat_id="+encodeURIComponent(chat_id);
				url += "&document="+encodeURIComponent(file_id);
				if (text) url += "&caption="+encodeURIComponent(text);
				if (reply_to) url += "&reply_to_message_id="+encodeURIComponent(reply_to);
				if (parse_mode) url += "&parse_mode="+parse_mode;
			}
			else if (type == "photo"){
				url += "sendPhoto?";
				url += "chat_id="+encodeURIComponent(chat_id);
				url += "&photo="+encodeURIComponent(file_id);
				if (text) url += "&caption="+encodeURIComponent(text);
				if (reply_to) url += "&reply_to_message_id="+encodeURIComponent(reply_to);
				if (parse_mode) url += "&parse_mode="+parse_mode;
			}
			else if (type == "sticker"){
				url += "sendSticker?";
				url += "chat_id="+encodeURIComponent(chat_id);
				url += "&sticker="+encodeURIComponent(file_id);
				if (reply_to) url += "&reply_to_message_id="+encodeURIComponent(reply_to);
			}
			else if (type == "video"){
				url += "sendVideo?";
				url += "chat_id="+encodeURIComponent(chat_id);
				url += "&video="+encodeURIComponent(file_id);
				if (text) url += "&caption="+encodeURIComponent(text);
				if (reply_to) url += "&reply_to_message_id="+encodeURIComponent(reply_to);
				if (parse_mode) url += "&parse_mode="+parse_mode;
			}
			else if (type == "video_note"){
				url += "sendVideoNote?";
				url += "chat_id="+encodeURIComponent(chat_id);
				url += "&video_note="+encodeURIComponent(file_id);
				if (reply_to) url += "&reply_to_message_id="+encodeURIComponent(reply_to);
			}
			else if (type == "voice"){
				url += "sendVoice?";
				url += "chat_id="+encodeURIComponent(chat_id);
				url += "&voice="+encodeURIComponent(file_id);
				if (text) url += "&caption="+encodeURIComponent(text);
				if (reply_to) url += "&reply_to_message_id="+encodeURIComponent(reply_to);
				if (parse_mode) url += "&parse_mode="+parse_mode;
			}
			else if (type == "location"){
				url += "sendLocation?";
				url += "chat_id="+encodeURIComponent(chat_id);
				url += "&longitude="+encodeURIComponent(lon);
				url += "&latitude="+encodeURIComponent(lat);
				if (reply_to) url += "&reply_to_message_id="+encodeURIComponent(reply_to);
			}
			else if (type == "inline_query"){
				url += "answerInlineQuery?";
				url += "inline_query_id="+encodeURIComponent(chat_id);
				var results;
				if (typeof text === "string" || text instanceof String) results = [{"type":"document","id":"0","title":text,"caption":text}];
				else if (text instanceof Array) results = text.map((txt,i)=>({
					type: "document",
					id: i,
					title: txt,
					caption: txt
				}));
				else {
					reject(new Error("Unsupported text value: "+text));
					return;
				}
				url += "&results="+JSON.stringify(results);
			}
			else if (type == "callback_query"){
				url += "answerCallbackQuery?";
				url += "callback_query_id="+encodeURIComponent(chat_id);
				url += "&text="+encodeURIComponent(text);
			}
			else {
				reject(new Error("Unknown message type: "+type));
				return;
			}
			// Send request to telegram API
			req.get(url,(err,res,body)=>{
				// Process response
				if (err) reject(err);
				else if (res && res.statusCode !== 200) reject(new Error("Invalid StatusCode: "+res.statusCode));
				else {
					try {
						resolve(JSON.parse(body));
					}
					catch(err){
						resolve(body);
					}
				}
			});
		});
	}
	forwardMessage(msg_id,from_chat_id,to_chat_id){
		return new Promise((resolve,reject)=>{
			// Create URL, add method type and query parameters
			var url = this.API_URL+"forwardMessage?";
			url += "chat_id="+encodeURIComponent(to_chat_id);
			url += "&from_chat_id="+encodeURIComponent(from_chat_id);
			url += "&message_id="+encodeURIComponent(msg_id);
			// Send request to telegram API
			req.get(url,(err,res,body)=>{
				// Process response
				if (err) reject(err);
				else if (res && res.statusCode !== 200) reject(new Error("Invalid StatusCode: "+res.statusCode));
				else {
					try { resolve(JSON.parse(body)); }
					catch(err) { resolve(body); }
				}
			});
		});
	}
	updateCommandList(commands,descriptions){
		return new Promise((resolve,reject)=>{
			// Create commands parameter for API call
			var cmd = [];
			if (commands instanceof Array && descriptions instanceof Array){
				for (var i=0;i<commands.length;i++){
					cmd.push({
						command: commands[i],
						description: descriptions[i]
					});
				}
			}
			else if (commands instanceof Array && descriptions === undefined){
				cmd = commands;
			}
			else {
				reject(new Error("Invalid arguments..."));
				rerurn;
			}
			// Create URL, add method type and query parameter
			var url = this.API_URL+"setMyCommands";
			// Send request to telegram API
			console.log(url);
			req.post({
				url: url,
				headers: {'content-type':'application/json'},
				body: JSON.stringify({commands:cmd})
			},(err,res,body)=>{
				// Handle response
				if (err) reject(err);
				else if (res && res.statusCode !== 200) {
					try{
						if (body) reject(JSON.parse(body));
						else reject(new Error("Invalid StatusCode: "+res.statusCode));
					}
					catch(err){
						reject(new Error("Invalid StatusCode: "+res.statusCode));
					}
				}
				else {
					try { resolve(JSON.parse(body)); }
					catch(err) { resolve(body); }
				}
			});
		});
	}
	getCommandList(){
		return new Promise((resolve,reject)=>{
			var url = this.API_URL + "getMyCommands";
			req.get(url,(err,res,body)=>{
				if (err) reject(err);
				else if (res && res.statusCode !== 200) reject(new Error("Invalid StatusCode: "+res.statusCode));
				else {
					try { resolve(JSON.parse(body)); }
					catch(err) { resolve(body); }
				}
			});
		});
	}
	getMe(){
		return new Promise((resolve,reject)=>{
			var url = this.API_URL + "getMe";
			req.get(url,(err,res,body)=>{
				if (err) reject(err);
				else if (res && res.statusCode !== 200) reject(new Error("Invalid StatusCode: "+res.statusCode));
				else {
					try { resolve(JSON.parse(body)); }
					catch(err) { resolve(body); }
				}
			});
		});
	}
}

module.exports = Bot;
