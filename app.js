"use strict";

var express = require('express');
var app = express();
var server = require('http').createServer(app);
var bodyParser = require('body-parser');
var io = require('socket.io')(server);
var path = require('path');
var env = require('node-env-file');
var redis = require('./inc/redis');

env('.env');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// static files folder setup
app.use(express.static(path.join(__dirname, 'public')));

//Middleware to parse request body
app.use(bodyParser.urlencoded({
    extended: true
}));

var chat_history = [];
var active_users = [];

//Fetch chat history from Redis
function fetchMessages(){
    redis.persister.get('chat_history', function(err, reply){
        if(reply){
            chat_history = JSON.parse(reply);
        }
    });
}

//Fetch active users from Redis
function fetchUsers(){
    redis.persister.get('active_users', function(err, reply){
        if(reply){
            active_users = JSON.parse(reply);
        }
    });
}

fetchMessages();
fetchUsers();

//Subscribe to necessary channels
redis.sub.subscribe('chat_messages');
redis.sub.subscribe('active_users');

//Listen for messages
redis.sub.on('message', function(channel, message){
    if(channel === 'chat_messages')
    {
        io.sockets.emit('message', JSON.parse(message));
    }else{
        io.sockets.emit('users', JSON.parse(message));
    }
});

//Handles the homepage route
app.get('/', function(req, res){
    res.render('index', { title: 'Chat Room' });
});

//Handles the chat room route
app.get('/chat/:username', function(req, res){
    res.render('room', {user: req.params.username})
});

//Return message history
app.get('/messages', function(req, res){
    fetchMessages();
    res.send(chat_history);
});

//Return active users
app.get('/users', function(req, res){
    fetchUsers();
    res.send(active_users);
});

//Create User
app.post('/user', function(req, res){

    //fetch latest version of active users
    fetchUsers();

    if(active_users.indexOf(req.body.user) === -1){
        //add user from array
        active_users.push(req.body.user);

        //persist new active user array
        redis.persister.set('active_users', JSON.stringify(active_users));

        //Announce arrival of user
        var msg = {'message': req.body.user+" just joined the chat room", 'user': 'system'};
        redis.pub.publish('chat_messages', JSON.stringify(msg));
        redis.pub.publish('active_users', JSON.stringify(active_users));
        //Fetch latest version of chat history
        fetchMessages();

        //Store message in chat history array and store
        chat_history.push(msg);
        redis.persister.set('chat_history', JSON.stringify(chat_history));

        //send response back to client
        res.send({'status': 200, 'message': 'User joined'});
    }else{
        res.send({'status': 403, 'message': 'User already exist'});
    }

    //Keep the active_user and chat_history arrays updated
    fetchMessages();
    fetchUsers();

});

//Remove user
app.delete('/user', function(req, res){

    //fetch latest version of active users
    fetchUsers();

    if(active_users.indexOf(req.body.user) !== -1){

        //remove user from array
        active_users.splice(active_users.indexOf(req.body.user, 1));

        //persist new active user array
        redis.persister.set('active_users', JSON.stringify(active_users));

        //Announce removal of user
        var msg = {'message': req.body.user+" just left the chat room", 'user': 'system'};
        redis.pub.publish('chat_messages', JSON.stringify(msg));
        redis.pub.publish('active_users', JSON.stringify(active_users));

        //Fetch latest version of chat history
        fetchMessages();

        //Store message in chat history array and store
        chat_history.push(msg);
        redis.persister.set('chat_history', JSON.stringify(chat_history));

        //send response back to client
        res.send({'status': 200, 'message': 'User removed'});
    }else{
        res.send({'status': 403, 'message': 'User does not exist'});
    }

    //Keep the active_user and chat_history arrays updated
    fetchMessages();
    fetchUsers();
});

//Create a message
app.post('/message', function(req, res){

    //Publish the new message
    var msg = {'message': req.body.msg, 'user': req.body.user};

    redis.pub.publish('chat_messages', JSON.stringify(msg));

    //Fetch latest version of chat history
    fetchMessages();

    //Store message in chat history array and store
    chat_history.push(msg);
    redis.persister.set('chat_history', JSON.stringify(chat_history));

    //send response back to client
    res.send("Message sent");

    //Keep the chat_history array updated
    fetchMessages();
});

//Start the server on specified port
server.listen(process.env.APP_PORT, function(){
    // log.log('App is running');
    console.log("Server started");
});