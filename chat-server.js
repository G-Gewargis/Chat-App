// Data structure to hold chat rooms and the users
const rooms = {
    // "room1": {
    //     name: "room1",
    //     password: null,
    //     users: [],
    //     bannedUsers: [],
    //     creator: null,
    //     messages: [] 
    // }
};

const users = {
    // "user1": {
    //     username: "user1",
    //     currentRoom: null,
    //     id: socketio.id
    // }
};

// Input sanitization helper functions
function sanitizeString(input, maxLength) {
    // Ensure input is a string
    if (typeof input !== 'string') {
        return '';
    }

    // Trim whitespace
    let sanitized = input.trim();

    // Limit length
    if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
    }

    // Escape < and > to prevent XSS attacks
    sanitized = sanitized.replace(/</g, '&lt;');
    sanitized = sanitized.replace(/>/g, '&gt;');

    return sanitized;
}

function isValidUsername(username) {
    // Username must be 3-20 characters, alphanumeric with underscores and hyphens only
    if (username.length < 3 || username.length > 20) {
        return false;
    }

    const validPattern = /^[a-zA-Z0-9_-]+$/;
    return validPattern.test(username);
}

function isValidRoomName(roomName) {
    // Room name must be 3-30 characters, alphanumeric with spaces, underscores, and hyphens
    if (roomName.length < 3 || roomName.length > 30) {
        return false;
    }

    const validPattern = /^[a-zA-Z0-9 _-]+$/;
    return validPattern.test(roomName);
}

// Require the packages we will use:
const http = require("http"),
    fs = require("fs");

// Using 3457, because 3456 is being used by module-6's individual assignment
const port = 3457;
const file = "client.html";
// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html, on port 3457:
const server = http.createServer(function (req, res) {
    // This callback runs when a new connection is made to our HTTP server.

    fs.readFile(file, function (err, data) {
        // This callback runs when the client.html file has been read from the filesystem.

        if (err) return res.writeHead(500);
        res.writeHead(200);
        res.end(data);
    });
});
server.listen(port);

// Import Socket.IO and pass our HTTP server object to it.
const socketio = require("socket.io")(http, {
    wsEngine: 'ws'
});

// Attach our Socket.IO server to our HTTP server to listen
const io = socketio.listen(server);
io.sockets.on("connection", function (socket) {
    // This callback runs when a new Socket.IO connection is established.

    socket.on('send_message', function (data) {
        const sender = users[socket.id];

        // Sanitize the message
        const message = sanitizeString(data["message"], 500);

        if (!sender) {
            socket.emit('error_message', { message: 'User not registered!' });
            return;
        }

        if (!sender.currentRoom) {
            socket.emit('error_message', { message: 'You are not in a room!' });
            return;
        }

        // Prevent empty messages
        if (!message || message.length === 0) {
            socket.emit('error_message', { message: 'Cannot send empty message!' });
            return;
        }

        const room = rooms[sender.currentRoom];
        if (!room.messages) {
            room.messages = [];
        }

        // Create message object with unique ID
        const messageObj = {
            id: Date.now() + '_' + Math.random().toString(36).substring(2, 11),
            message: message,
            sender: sender.username,
            reactions: {}
        };

        room.messages.push(messageObj);

        io.to(sender.currentRoom).emit("message_to_client", messageObj);
    });

    socket.on('send_private_message', function (data) {
        const sender = users[socket.id];

        // Sanitize inputs
        const recipientName = sanitizeString(data["recipient"], 20);
        const message = sanitizeString(data["message"], 500);

        if (!sender) {
            socket.emit('error_message', { message: 'User not registered!' });
            return;
        }

        const recipientID = Object.keys(users).find(id => users[id].username === recipientName);

        if (!recipientID) {
            socket.emit('error_message', { message: 'Recipient not found!' });
            return;
        }

        if (users[recipientID].currentRoom !== sender.currentRoom) {
            socket.emit('error_message', { message: 'Recipient is not in the same room!' });
            return;
        }

        // Prevent empty messages
        if (!message || message.length === 0) {
            socket.emit('error_message', { message: 'Cannot send empty message!' });
            return;
        }

        io.to(recipientID).emit("private_message_to_client", {
            message: message,
            sender: sender.username,
            recipient: recipientName,
            isReceived: true
        });

        socket.emit("private_message_to_client", {
            message: message,
            sender: sender.username,
            recipient: recipientName,
            isReceived: false
        });
    });

    // Handle message reactions
    socket.on('add_reaction', function (data) {
        const user = users[socket.id];

        if (!user || !user.currentRoom) {
            return;
        }

        const room = rooms[user.currentRoom];
        if (!room || !room.messages) {
            return;
        }

        const messageId = data.messageId;
        const emoji = sanitizeString(data.emoji, 10);

        // Find the message and add reaction
        const message = room.messages.find(m => m.id === messageId);
        if (message) {
            if (!message.reactions[emoji]) {
                message.reactions[emoji] = [];
            }

            // Add user if not already reacted with this emoji
            if (!message.reactions[emoji].includes(user.username)) {
                message.reactions[emoji].push(user.username);
            }

            // Broadcast reaction update to room
            io.to(user.currentRoom).emit('reaction_updated', {
                messageId: messageId,
                reactions: message.reactions
            });
        }
    });

    socket.on('remove_reaction', function (data) {
        const user = users[socket.id];

        if (!user || !user.currentRoom) {
            return;
        }

        const room = rooms[user.currentRoom];
        if (!room || !room.messages) {
            return;
        }

        const messageId = data.messageId;
        const emoji = sanitizeString(data.emoji, 10);

        // Find the message and remove reaction
        const message = room.messages.find(m => m.id === messageId);
        if (message && message.reactions[emoji]) {
            message.reactions[emoji] = message.reactions[emoji].filter(u => u !== user.username);

            // Remove emoji key if no users left
            if (message.reactions[emoji].length === 0) {
                delete message.reactions[emoji];
            }

            // Broadcast reaction update to room
            io.to(user.currentRoom).emit('reaction_updated', {
                messageId: messageId,
                reactions: message.reactions
            });
        }
    });


    // Room creation and joining
    socket.on('create_room', function (data) {
        const roomName = sanitizeString(data["name"], 30);
        const password = data["password"];
        const user = users[socket.id];

        if (!user) {
            socket.emit('error_message', { message: 'User not registered!' });
            return;
        }

        if (!isValidRoomName(roomName)) {
            socket.emit('error_message', { message: 'Invalid room name! Use 3-30 characters (letters, numbers, spaces, hyphens, underscores).' });
            return;
        }

        // Sanitize password if provided
        let sanitizedPassword = null;
        if (password) {
            sanitizedPassword = sanitizeString(password, 50);
            if (sanitizedPassword.length === 0) {
                sanitizedPassword = null;
            }
        }

        if (!rooms[roomName]) {
            rooms[roomName] = {
                name: roomName,
                password: sanitizedPassword,
                users: [socket.id],
                bannedUsers: [],
                creator: socket.id,
                messages: []
            };
        }
        else {
            socket.emit('error_message', { message: 'Room already exists!' });
            return;
        }

        // If user is currently in a different room, leave it first
        if (user.currentRoom && user.currentRoom !== roomName) {
            const oldRoomName = user.currentRoom;
            const oldRoom = rooms[oldRoomName];
            if (oldRoom) {
                // Remove user from old room
                oldRoom.users = oldRoom.users.filter(id => id !== socket.id);
                socket.leave(oldRoomName);

                // Update user list for old room
                const oldRoomUsernames = oldRoom.users
                    .filter(id => users[id])
                    .map(id => users[id].username);
                io.to(oldRoomName).emit('update_user_list', oldRoomUsernames);

                // If old room is empty, delete it
                if (oldRoom.users.length === 0) {
                    delete rooms[oldRoomName];
                }
                // If user was the creator, transfer ownership
                else if (oldRoom.creator === socket.id) {
                    const newCreator = oldRoom.users[0];
                    oldRoom.creator = newCreator;
                    io.to(newCreator).emit('you_are_now_creator', {
                        room: oldRoomName
                    });

                    // Broadcast creator change to room
                    oldRoom.users.forEach(id => {
                        if (id !== newCreator && id !== socket.id) {
                            io.to(id).emit('creator_changed', {
                                newCreator: users[newCreator].username
                            });
                        }
                    });
                }

                // Broadcast leave event to old room
                io.to(oldRoomName).emit('user_left_room', {
                    username: user.username
                });
            }
        }

        socket.join(roomName);
        user.currentRoom = roomName;

        // Notify the creator and update everyone's lists
        socket.emit('room_created', {
            room: rooms[roomName],
            isCreator: true
        });
        const usernames = rooms[roomName].users
            .filter(id => users[id])
            .map(id => users[id].username);
        io.to(roomName).emit('update_user_list', usernames);

        // Send room list with password info
        const roomList = Object.keys(rooms).map(name => ({
            name: name,
            hasPassword: !!rooms[name].password
        }));
        io.emit('update_room_list', roomList);

    });
    socket.on('join_room', function (data) {
        const roomName = sanitizeString(data["name"], 30);
        const password = data["password"];
        const user = users[socket.id];
        const room = rooms[roomName];

        if (!user) {
            socket.emit('error_message', { message: 'User not registered!' });
            return;
        }

        if (!room) {
            socket.emit('error_message', { message: 'Room does not exist!' });
            return;
        }

        // Sanitize password if provided
        let sanitizedPassword = null;
        if (password) {
            sanitizedPassword = sanitizeString(password, 50);
        }

        if (room.password && room.password !== sanitizedPassword) {
            socket.emit('error_message', { message: 'Incorrect password!' });
            return;
        }

        if (room.bannedUsers.includes(socket.id)) {
            socket.emit('error_message', { message: 'You are banned from this room!' });
            return;
        }

        if (room.users.includes(socket.id)) {
            socket.emit('error_message', { message: 'You are already in this room!' });
            return;
        }

        // If user is currently in a different room, leave it first
        if (user.currentRoom && user.currentRoom !== roomName) {
            const oldRoomName = user.currentRoom;
            const oldRoom = rooms[oldRoomName];
            if (oldRoom) {
                // Remove user from old room
                oldRoom.users = oldRoom.users.filter(id => id !== socket.id);
                socket.leave(oldRoomName);

                // Update user list for old room
                const oldRoomUsernames = oldRoom.users
                    .filter(id => users[id])
                    .map(id => users[id].username);
                io.to(oldRoomName).emit('update_user_list', oldRoomUsernames);

                // If old room is empty, delete it
                if (oldRoom.users.length === 0) {
                    delete rooms[oldRoomName];
                }
                // If user was the creator, give away the ownership to a different user
                else if (oldRoom.creator === socket.id) {
                    const newCreator = oldRoom.users[0];
                    oldRoom.creator = newCreator;
                    io.to(newCreator).emit('you_are_now_creator', {
                        room: oldRoomName
                    });

                    // Broadcast creator change to room 
                    oldRoom.users.forEach(id => {
                        if (id !== newCreator && id !== socket.id) {
                            io.to(id).emit('creator_changed', {
                                newCreator: users[newCreator].username
                            });
                        }
                    });
                }

                // Broadcast leave event to old room
                io.to(oldRoomName).emit('user_left_room', {
                    username: user.username
                });
            }
        }

        socket.join(roomName);
        user.currentRoom = roomName;
        room.users.push(socket.id);

        socket.emit('room_joined', {
            room: roomName,
            isCreator: room.creator === socket.id
        });

        const usernames = room.users
            .filter(id => users[id])
            .map(id => users[id].username);
        io.to(roomName).emit('update_user_list', usernames);

        // Send room list with password info
        const roomList = Object.keys(rooms).map(name => ({
            name: name,
            hasPassword: !!rooms[name].password
        }));
        io.emit('update_room_list', roomList);

        // Broadcast join event to room (but not to the joiner)
        socket.to(roomName).emit('user_joined_room', {
            username: user.username
        });
    });

    socket.on('register_user', function (data) {
        const username = sanitizeString(data["username"], 20);

        if (!isValidUsername(username)) {
            socket.emit('error_message', { message: 'Invalid username! Use 3-20 characters (letters, numbers, hyphens, underscores).' });
            return;
        }

        const usernameTaken = Object.values(users).some(
            (user) => user.username === username
        )

        if (usernameTaken) {
            socket.emit('error_message', { message: 'Username already taken!' });
            return;
        }

        users[socket.id] = {
            username: username,
            currentRoom: null,
            id: socket.id
        };
        console.log(`User registered: ${username}`);
        socket.emit('registration_successful', { user: users[socket.id] });

        // Send current room list to the new user that registered
        const roomList = Object.keys(rooms).map(name => ({
            name: name,
            hasPassword: !!rooms[name].password
        }));
        socket.emit('update_room_list', roomList);
    });

    socket.on('kick_user', function (data) {
        const targetUsername = sanitizeString(data["username"], 20);
        const roomName = sanitizeString(data["room"], 30);
        const room = rooms[roomName];

        if (!room) {
            socket.emit('error_message', { message: 'Room does not exist!' });
            return;
        }

        if (room.creator !== socket.id) {
            socket.emit('error_message', { message: 'Only the room creator can kick users!' });
            return;
        }

        const targetID = Object.keys(users).find(id => users[id].username === targetUsername);

        if (!targetID || !room.users.includes(targetID)) {
            socket.emit('error_message', { message: 'User not found in the room!' });
            return;
        }

        room.users = room.users.filter(id => id !== targetID);
        users[targetID].currentRoom = null;
        io.sockets.sockets.get(targetID).leave(roomName);

        // Filter out any invalid user IDs before mapping to usernames
        const usernames = room.users
            .filter(id => users[id])
            .map(id => users[id].username);
        io.to(roomName).emit('update_user_list', usernames);

        // Broadcast kick event to room
        io.to(roomName).emit('user_kicked_from_room', {
            username: targetUsername,
            kickedBy: users[socket.id].username
        });

        io.to(targetID).emit('kicked_from_room', { room: roomName });
    });

    socket.on('ban_user', function (data) {
        const targetUsername = sanitizeString(data["username"], 20);
        const roomName = sanitizeString(data["room"], 30);
        const room = rooms[roomName];

        if (!room) {
            socket.emit('error_message', { message: 'Room does not exist!' });
            return;
        }

        if (room.creator !== socket.id) {
            socket.emit('error_message', { message: 'Only the room creator can ban users!' });
            return;
        }

        const targetID = Object.keys(users).find(id => users[id].username === targetUsername);

        if (!targetID || !room.users.includes(targetID)) {
            socket.emit('error_message', { message: 'User not found in the room!' });
            return;
        }

        room.users = room.users.filter(id => id !== targetID);
        room.bannedUsers.push(targetID);
        users[targetID].currentRoom = null;
        io.sockets.sockets.get(targetID).leave(roomName);

        // Filter out any invalid user IDs before mapping to usernames
        const usernames = room.users
            .filter(id => users[id])
            .map(id => users[id].username);
        io.to(roomName).emit('update_user_list', usernames);

        // Broadcast ban event to room
        io.to(roomName).emit('user_banned_from_room', {
            username: targetUsername,
            bannedBy: users[socket.id].username
        });

        io.to(targetID).emit('banned_from_room', { room: roomName });
    });


    socket.on('leave_room', function () {
        const user = users[socket.id];

        if (!user) {
            socket.emit('error_message', { message: 'User not registered!' });
            return;
        }

        if (!user.currentRoom) {
            socket.emit('error_message', { message: 'You are not in a room!' });
            return;
        }

        const roomName = user.currentRoom;
        const room = rooms[roomName];

        if (room) {
            // If the user is the creator and there are other users, assign a new creator
            if (room.creator === socket.id && room.users.length > 1) {
                const newCreator = room.users.find(id => id !== socket.id);
                room.creator = newCreator;

                // Notify the new creator
                io.to(newCreator).emit('you_are_now_creator', {
                    room: roomName
                });

                // Broadcast creator change to room
                room.users.forEach(id => {
                    if (id !== newCreator && id !== socket.id) {
                        io.to(id).emit('creator_changed', {
                            newCreator: users[newCreator].username
                        });
                    }
                });
            }

            room.users = room.users.filter(id => id !== socket.id);
            socket.leave(roomName);
            user.currentRoom = null;

            // Filter out any invalid user IDs and map to usernames
            const usernames = room.users
                .filter(id => users[id])
                .map(id => users[id].username);
            io.to(roomName).emit('update_user_list', usernames);

            // Broadcast leave event to room
            io.to(roomName).emit('user_left_room', {
                username: user.username
            });

            socket.emit('left_room', { room: roomName });

            // If room is empty, delete it
            if (room.users.length === 0) {
                delete rooms[roomName];
                const roomList = Object.keys(rooms).map(name => ({
                    name: name,
                    hasPassword: !!rooms[name].password
                }));
                io.emit('update_room_list', roomList);
            }
        }
    });

    socket.on('disconnect', function () {
        const user = users[socket.id];
        if (user && user.currentRoom) {
            const room = rooms[user.currentRoom];
            if (room) {
                // Transfer ownership if creator disconnects
                if (room.creator === socket.id && room.users.length > 1) {
                    const newCreator = room.users.find(id => id !== socket.id);
                    room.creator = newCreator;
                    io.to(newCreator).emit('you_are_now_creator', {
                        room: user.currentRoom
                    });

                    // Broadcast creator change to room
                    room.users.forEach(id => {
                        if (id !== newCreator && id !== socket.id) {
                            io.to(id).emit('creator_changed', {
                                newCreator: users[newCreator].username
                            });
                        }
                    });
                }

                room.users = room.users.filter(id => id !== socket.id);

                // Filter out any invalid user IDs before mapping to usernames
                const usernames = room.users
                    .filter(id => users[id])
                    .map(id => users[id].username);
                io.to(user.currentRoom).emit('update_user_list', usernames);

                // Broadcast disconnect event to room
                io.to(user.currentRoom).emit('user_left_room', {
                    username: user.username
                });

                if (room.users.length === 0) {
                    delete rooms[user.currentRoom];
                    const roomList = Object.keys(rooms).map(name => ({
                        name: name,
                        hasPassword: !!rooms[name].password
                    }));
                    io.emit('update_room_list', roomList);
                }
            }
        }

        // Always delete the user from the users object on disconnect
        if (users[socket.id]) {
            delete users[socket.id];
        }
    });
});