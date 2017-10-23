## Building a chat room in 30 minutes using Redis, Socket.io and Express ##

You are listening to music in your office then your desk phone rings, you boss hurriedly says "We need a chat room ready in less than a hour to discuss the new project we are working on". As the only developer around you said "Ready in a bit!" with no idea on what to do.

Don't worry, get ready to build a simple chat room using Manifold, Express, Socket.io and Zeit. This tutorial will show you how easy it is to use one of Redis awesome feature called pub/Sub with Socket.io, to send and receive messages. Time to get to action!

### Quick Intro on Redis ###

Redis which means **REmote DIctionary Server**, is an open source, in-memory data structure store. It can be used as a key-value database, cache and message broker. It supports a wide range of data structures such as strings, hashes, sets, lists etc. It also has on-disk persistence, which can be achieved by regularly dumping data to the disk or by appending commands to a log.

However, we are interested in one of Redis feature called **Pub/Sub**. Redis Pub/Sub allows a publisher (sender) send a message to a channel without knowing if there is any interested subscriber (receiver). Also, a subscriber express interest in a channel to receive messages without any knowledge of a publisher. Basically, a publisher is like a satellite antenna that sends out messages into the deep space without knowing if aliens exist to receive the messages, while a subscriber is like a base station on earth listening on a radio channel hoping to receive a message from deep space, without knowing if aliens are broadcasting.

Publishers and Subscribers are decoupled to make the process very fast and improve scalability, since both subscribers and publishers are not aware of each other. 
 
 **Pros of using Redis PubSub**
 - It is very fast, since it makes use of in-memory data stores.
 
 - Slow subscriber can not delay publishers from broadcasting messages, since it is not queue based.
 
 - The simplicity allows users to be flexible and easily scale applications
 
 **Cons of using Redis PubSub**
 - It is not capable of persistence, which means messages are not saved or cached. Once a subscriber misses a message, there is no way it can get the message again. However, there are measures you can put in place to compensate, as we will see later in this tutorial.

You can read up on Redis [here]().


### Set up ###

First, we need to set up Redis. Instead of spending time installing and configuring Redis on your server, you can head over to Manifold and create an instance. If you don't have a Manifold account, you can [quickly create one]().

*insert image*

Once you are logged in, provision a RedisGreen resource, this should take time. Click on `Reveal Credentials` button once the resource has been created, to reveal the Redis URL.

*insert image*


Create a `.env` file in your project root directory and paste the URL in it.

```
REDIS_URL=THE REDIS URL GENERATED
``` 

### Install modules ###

To get started, we are going to install some node modules to get the chat room ready quick. Ensure you have Node and NPM installed, then open your command line or terminal and run this:

```bash
npm install body-parser express node-env-file path pug redis socket.io --save
```

 The command above will install ExpressJS framework, Redis client, Socket.io, Pug as view template engine, node-env-file to configure environment file (.env) and body-parser to parse body requests, especially for POST methods.
 
 > **Quick Note:** Socket.io allows real-time communication among clients. We will use it to send event-based messages between the web clients and the server.
 
 ### Setting up Redis ###
 
 Create a folder `inc` in your project root folder and create a file named `redis.js`, i.e `inc/redis.js` and copy the code below:
 
 ```js
var redis = require('redis');
var env = require('node-env-file');
env('.env');

var pub = redis.createClient(process.env.REDIS_URL);
var sub = redis.createClient(process.env.REDIS_URL);

var persister = redis.createClient(process.env.REDIS_URL);

exports.pub = pub;
exports.sub = sub;
exports.persister = persister;
```

In the code snippet above, we did the following:

1. Imported the Redis and node-env-file modules
2. set the environment file
3. Created three Redis clients - `pub`, `sub` and `persister`
4. Exported the clients

The first client `pub`, will be used to publish messages. `sub` will used to subscribe to channels and listen for messages. Remember that disadvantage of Redis PubSub feature, `persister` will used to store published messages, so that they are available after the broadcast.

Awesome right?!

### Setting up the server ###

For this tutorial, we will use Express as our Node framework. Express is a minimal and flexible framework that provides a robust set of features for web and mobile applications. Create a file `app.js` in your project root folder and copy the code snippet below into it:

```js
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
```
In the code snippet above, we did the following

1. Imported and created an instance of the Express
2. Created a server using the instance of Express
3. Imported body-parser, socket.io, path, node-env-file modules
4. Imported the Redis clients we created earlier in `inc/redis.js`
5. Set the environment file
6. Set Pug as our view template engine and configured the path to our templates
7. Configured the path our static files (stylesheets, scripts and images)
8. Configured a middleware to use body-parser to parse request body
9. Created an array to hold the chat messages and active users using the chat room

When users join the chat room, they should be able to see existing messages shared and active users in the room. Therefore, we are going to use `chat_history` and `active_users` array to store the data fetched from Redis, using the `persister` Redis client. Copy the code snippet below to `app.js`:

```js
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
```
In the two functions above, we fetched the chat history and active users from Redis and stored them in the `chat_history` and `active_users` array. Anytime we call the `fetchMessages` and `fetchUsers` function, it updates the arrays.

Next, we are going to subscribe and listen to channels, for published messages using the `sub` Redis client and emit the messages using to all clients using Socket.io. Copy the code snippet below:

```js
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
```
In the code snippet above, we subscribed to two channels: `chat_messages` and `active_users`. Whenever, a message is published by a publisher, an event `message` is triggered. Then subscriber can get the message by listening for the event. In the code snippet above, if the message is published on the `chat_messages` channel, socket.io emits the message using `message` event, else, it emits using `user` event. 

Next step is to configure some of our endpoints. Copy the code snippet below:

```js
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
```
The `/` endpoint displays the homepage of the app, by rendering the `index` view template, while the `/chat/:username` renders the chat room using the `room` view template. We will cover the view templates later in this tutorial.

The GET `/messages` endpoint, returns the messages stored in the `chat_history` array while GET `/users` returns the list of active users stored in `active_users` array.

Next step, we need to publish and store new users joining the chat room and  messages in Redis. Also, when a user leaves the chat room, we need to remove them from the active users list. We will start with the endpoint for creating new users, copy the code snippet below:

```js
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
``` 
In the code snippet above, we checked if the username submitted does not exist already, to avoid messages from different persons showing as one. After that, we added the username to our `active_user` array and stored it in Redis using the `persister` client. Next, we published two things using the `pub` client; the first announces the arrival of a new user and the second, publishes the updated `active_user` array. After that, the added the message announcing the new user to the `chat_history` array and stored in Redis. Finally, we sent a response back to the frontend client.

Let's quickly define the endpoints for deleting users and creating messages. Add the code snippet below to `app.js`:

```js
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

```
In the code snippet above, we have two endpoints: DELETE `/user` and POST `/message`. To first endpoint removes the user from the `active_users` array, stores the updated arrays Redis, publishes the removal of the user and updated active users list. The second endpoint publishes the message sent by a user, updates the `chat_history` array and stores the updated array in Redis.

Finally, let us start our server. First, we update our `.env` file with the port we want the app started on. Add below to the `.env` file:

```
APP_PORT=3000
```
Next, add the code snippet below to `app.js`:
```js
//Start the server on specified port
server.listen(process.env.APP_PORT, function(){
    console.log("Server started");
});
```
Now that we have our server ready, let's move on to the front end.

### The Frontend ###

Remember we said something about Pug (formerly known as Jade) earlier on? Yes! We are using it as our view template engine, alongside CSS & JQuery to build the front end client for the chat room.

Create a folder `views` and a file in it `master.pug` so that the path is `views/master.pug`. This file will be the parent template, which other child templates will inherit. Copy the code snippet below:
```jade
doctype html
html
    head
        title= title
        link(rel='stylesheet', href='https://fonts.googleapis.com/css?family=Raleway:300,400,700')
        meta(name='viewport', content='width=device-width, initial-scale=1, maximum-scale=1')
        link(type='text/css', rel='stylesheet', href='/css/style.css')
    body
        block content

        script(src='https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js')
        script(src='/js/script.js')
        block script
```
When we extend this file, we can override specific areas labelled blocks. In the code snippet above, we have two blocks: `content` and `script`. We will be extending the file in our child templates using those blocks. Also, Pug relies on indentation to create parent and child elements, therefore, we have to pay attention to that. You can check out [pug's documentation]()

Next, we create `index.pug`, the template file we called in our GET `/` endpoint. It will hold the structure of the homepage. Copy the code snippet below:
```jade
extends master

block content
    div.container
        h1.title=title
        div.joinbox
            form.join
                input.username(type="text", placeholder="Enter your username", required="required")
                input.submit(type="submit", value="Join Room")

```
In the code snippet above, we are extending `master.pug` and overriding the block `content` to hold the structure we want. For the homepage, we are going to display a form to collect the username and submit it. 

Next, let's create the template file for the chat room, create file `room.pug` and paste the code snippet below:
```jade
extends master

block content
    div.room
        div.chat
        div.users
            h2.title Active Users
        div.clearfix
        div.sendbox
            form.send
                textarea.message(placeholder='Type your message here', required='required')
                input.name(type='hidden', value=user)
                input.submit(type='submit', value='Send')

block script
    script(src='/socket.io/socket.io.js')
    script(src='../js/chat.js')
```
Here, we added the socket.io script and the script handling the room, by overriding the block `script`.

Next, we need to style the structure we have defined above. Create a stylesheet `style.css` in `public/css`, so that the path is `public/css/style.css` and paste below into it:
```css
*{
    padding: 0;
    margin: 0;
    box-sizing: border-box;
}

html, p, textarea, h1, h2{
    font-family: Raleway, "Lucida Grande", Helvetica, Arial, sans-serif;
    font-size: 10px;
}

body{
    background: #23074d;  /* fallback for old browsers */
    background: -webkit-linear-gradient(to right, #cc5333, #23074d);  /* Chrome 10-25, Safari 5.1-6 */
    background: linear-gradient(to right, #cc5333, #23074d); /* W3C, IE 10+/ Edge, Firefox 16+, Chrome 26+, Opera 12+, Safari 7+ */
    height: 100vh;
    position: relative;
}

h1{
    font-size: 6rem;
    color: #fff;
    text-align: center;
}

.container{
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    transform: translateY(-50%);
}

.joinbox{
    max-width: 500px;
    border:2px solid #ffffff;
    padding: 4rem;
    width:70%;
    margin: 5rem auto 0;
    border-radius: 5px;
}

.joinbox .username{
    display: block;
    width: 100%;
    margin:auto;
    padding: 1.5rem;
    background-color: transparent;
    border: none;
    border-bottom: 2px solid #ffffff;
    color: #ffffff;
    font-size: 2rem;
}

.joinbox .submit{
    background-color: #ffffff;
    padding: 1.5rem;
    border: none;
    /*border: 2px solid #ffffff;*/
    display: block;
    width: 100%;
    margin: 3rem auto 0;
    color: #772D40;
    font-size: 2rem;
    transition: all ease 500ms;
}

.joinbox .submit:hover{
    box-shadow: 0 0 5px rgba(0,0,0,0.7);
}

.joinbox .submit[disabled="disabled"]{
    opacity: 0.7;
    cursor: not-allowed;
}

.alert{
    background-color: #cab0a9;
    color: #772D40;
    display: block;
    padding: 0.5rem 1rem;
    font-size: 1.4rem;
}

.clearfix{
    content: ' ';
    height: 0;
    clear: both;
    position: relative;
}

.room{
    width: 100%;
    position: fixed;
    bottom: 0;
}

.chat{
    width:68%;
    margin: auto 1%;
    background-color: #ffffff;
    padding: 2rem;
    color: #772D40;
    display: inline-block;
    overflow-y: auto;
    max-height:500px;
    vertical-align: bottom;
}

.chat .item{
    padding: 0.75rem 0;
    display: block;
    border-bottom: thin solid #f0f0f0;
    font-size: 1.4rem;
}

.chat .item:last-child{
    border-bottom: none;
}

.chat .user{
    color: #23074d;
    display: block;
    font-weight: 700;
}

.chat .system{
    color: #cc5333;
    display: block;
    font-weight: 700;
}

.users{
    background-color: #ffffff;
    margin: auto 1%;
    width:28%;
    color: #772D40;
    display: inline-block;
    font-size: 1.6rem;
    max-height:500px;
    overflow-y: auto;
    vertical-align: bottom;
}

.users .title{
    background-color: #772D40;
    color: #ffffff;
    padding: 1rem 2rem;
    margin-bottom: 1rem;
    text-align: center;
    display: block;
    font-size: 1.8rem;
}

.users .item{
    padding: 1.2rem 2rem;
    display: block;
    border-bottom: thin solid #f0f0f0;
    font-size: 1.5rem;
}

.users .item:last-child{
    border-bottom: none;
}

.send{
    margin-top: 2rem;
    display: block;
    background-color: #ffffff;
    padding: 2rem;
}

.send .message{
    display: inline-block;
    width:72%;
    margin-right: 3%;
    background-color: #f0f0f0;
    border: none;
    font-size: 1.6rem;
    padding: 1.5rem;
    box-shadow: 0 0 2px rgba(0,0,0,0.2);
}

.send .submit{
    display: inline-block;
    width:25%;
    background-color: #772D40;
    padding: 1.5rem;
    border: none;
    color: #ffffff;
    font-size: 2rem;
    vertical-align: bottom;
    transition: all ease 500ms;
}
```
Finally, we need make our username registration form and chat room work. We are going to make this possible by using jQuery; a javascript library, to make requests to the endpoints.

First, let's create the script to handle username registration. Create file `script.js` and paste the code snippet below:
```js
$(document).ready(function(){

    //Registration form submission
    $('.join').on("submit", function(e) {

        e.preventDefault();
        $('.submit').prop('disabled', true);

        //Register user
        $.post('/user', {user: $('.username').val()})
            .done(function(res){
                if(res.status === 200){
                    window.location = 'chat/'+$('.username').val();
                }else{
                    $('.submit').prop('disabled', false);

                    $('.join').prepend('<p class="alert">The username is already taken!</p>');
                    setTimeout(function(){
                        $('.alert').fadeOut(500, function () {
                            $(this).remove();
                        })
                    }, 2000)
                }
            });
    });
});
```

Once the user submits the form, a POST request is sent to `/user` with the username. If the response status is 200, we redirect to the chat room, else, we display a message that disappears after 2 seconds.

Next, let's power our chat room. We need to display the chat history, active users, update the message wall when another user sends a message and also update the users list when a user joins or leave. Create a file `chat.js` in `public/js` folder and copy the code snippet below:
```js
$(document).ready(function(){

    var socket = io();

    //Get the chat history
    $.get('/messages')
        .done(function(res){
            $.each(res, function(index, value){
                if(value.user === 'system'){
                    $('.chat').append('<p class="item"><span class="system">'+value.user+': </span><span class="msg">'+value.message+'</span></p>');
                }else{
                    $('.chat').append('<p class="item"><span class="user">'+value.user+': </span><span class="msg">'+value.message+'</span></p>');
                }
            });

            $('.chat').animate({'scrollTop': 999999}, 200);
        });

    //Get the list of all active users
    $.get('/users')
        .done(function(res){
            $.each(res, function(index, value){
                $('.users').append('<p class="item">'+value+'</span>');
            });
        });

    //Message box submission using the 'Enter' key
    $('.room .message').on("keydown", function(e){

        if(e.keyCode === 13){
            e.preventDefault();

            var user = $('.name').val();
            var msg = $('.message').val();

            $.post('/message', {user: user, msg: msg})
                .done(function(){
                    $('.message').val('');
                    $('.submit').prop('disabled', false);
                });
        }

    });

    //Message box submission
    $('.room').on("submit", function(e){
        e.preventDefault();

        var user = $('.name').val();
        var msg = $('.message').val();

        $.post('/message', {user: user, msg: msg})
            .done(function(){
                $('.message').val('');
                $('.submit').prop('disabled', false);
            });
    });

    //Remove user from active user list just before closing the window
    window.onbeforeunload = function(){
        $.ajax({
            method: 'DELETE',
            url: '/user',
            data: { user: $('.name').val()}
        })
            .done(function( msg ) {
                alert( msg.message);
            });

        return null;
    };

    //Listens to when a chat message is broadcasted and displays it
    socket.on('message', function(data) {
        console.log(data);
        var username = data.user;
        var message = data.message;
        if(username === 'system'){
            $('.chat').append('<p class="item"><span class="system">'+username+': </span><span class="msg">'+message+'</span></p>');
        }else{
            $('.chat').append('<p class="item"><span class="user">'+username+': </span><span class="msg">'+message+'</span></p>');
        }

        $('.chat').animate({'scrollTop': 999999}, 200);
    });

    //Listens to when the active user list is updated and broadcasted
    socket.on('users', function(data) {
        $('.users .item').remove();

        $.each(data, function(index, value){
            $('.users').append('<p class="item">'+value+'</span>');
        });
    });
});
``` 

In the code snippet above, we did the following

1. Created an instance of socket.io named `socket`
2. We fetched all the messages from the server and displayed it
3. We fetched the list of all active users from the server and displayed it
4. Send messages submitted by users to the server, either by clicking the send button or hitting enter.
5. Remove a user from the active user list on the server, just before the browser tab or window is closed
6. listen for messages emitted by the server and add them to the message wall using socket.io
7. Listen for updated active users list and display them using socket.io

Our chat room is now ready for deployment!

### Deployment ###

Before we deploy the application for usage, we need to quickly edit `package.json` in the root folder, so that we can start the app automatically, when we deploy. Add this to the file:

```text
"scripts" : {
 "start": "nodemon ./app.js"
}
```

Finally, time to deploy! We will use a simple tool called `now` by Zeit. Let’s quickly install this, run this in your terminal:

```bash
npm install -g now
```
Once the installation is done, navigate to the project root folder in your terminal and run the `now` command. If it is your first time, you will be prompted to create an account. Once you are done, run the `now` command again, a URL will be generated and your project files uploaded.

*insert image*

You can now access the simple application via the URL generated. Pretty straightforward!

*insert image*