## Building a chat room in 30 minutes using Redis, Socket.io and Express ##

You are relaxing and listening to music in your office, then all of a sudden your desk phone rings, your boss hurriedly says “We need a chat room built and ready in less than 30 minutes to discuss a new project we are going to work on soon”. As the only developer around, you said “Ready in a bit!” with no idea about how to build one.

Don’t worry, get ready to build a simple chat room using [Manifold](), [Express](), [Socket.io]() and [Zeit](). This tutorial will show you how easy it is to use one of Redis’ awesome feature called pub/Sub with Socket.io, to send and receive messages. Time to get to the action!

### Quick Intro on Redis ###

Redis, which means REmote DIctionary Server, is an open source, in-memory data structure store. It can be used as a key-value database, cache and message broker. It supports a wide range of data structures such as strings, hashes, sets, lists etc. It also has on-disk persistence, which can be achieved by regularly dumping data to the disk or by appending commands to a log.

However, we are interested in one of Redis feature called Pub/Sub. Redis Pub/Sub allows a publisher (sender) send a message to a channel without knowing if there is any interested subscriber (receiver). Also, a subscriber expresses interest in a channel to receive messages without any knowledge of a publisher. Basically, a publisher is like a satellite antenna that sends out messages into deep space without knowing if aliens exist to receive the messages, while a subscriber is like a base station on Earth listening on a radio channel hoping to receive a message from deep space, without knowing if aliens are broadcasting.

Publishers and Subscribers are decoupled to make the process very fast and improve scalability since both subscribers and publishers are not aware of each other.
 
 **Pros of using Redis PubSub**
 - It is very fast, since it makes use of in-memory data stores.
 
 - Slow subscriber can not delay publishers from broadcasting messages, since it is not queue based.
 
 - The simplicity allows users to be flexible and easily scale applications
 
 **Cons of using Redis PubSub**
 - It is not capable of persistence, which means messages are not saved or cached. Once a subscriber misses a message, there is no way it can get the message again. However, there are measures you can put in place to compensate, as we will see later in this tutorial.

You can read up on Redis [here]().


### Set up ###

First, we need to set up Redis. Instead of spending time installing and configuring Redis on your server, you can head over to Manifold and create an instance. If you don’t have a Manifold account, you can [quickly create one]().

*insert image*

Once you are logged in, create a new project and provision a RedisGreen resource, this shouldn’t take very much time.

*insert image*

Click on `Download .env` button once the resource has been created, to download the `.env` file containing the credentials.

*insert image*

Copy the downloaded `.env` file and paste it in your project root directory.


### Install modules ###

To get started, we are going to install some node modules to get the chat room ready quickly. Ensure you have Node and NPM installed, then open your command line or terminal and run this:

```bash
npm install bluebird body-parser express node-env-file path pug redis socket.io --save
npm babel-cli babel-preset-env nodemon  --save-dev
```

 The command above will install ExpressJS framework, Redis client, Bluebird to promisify the Redis client, Socket.io, Pug as view template engine, node-env-file to configure environment file (.env) and body-parser to parse body requests, especially for POST methods.
 
 Also, we are going to use Babel to transpile our JavaScript from ES6.
 
 Quick Note: Socket.io allows real-time communication among clients. We will use it to send event-based messages between the web clients and the server.
 
 ### Setting up Redis ###
 
 Create a folder `lib` in your project root folder and create a file named redis.js, i.e `lib/redis.js` and copy the code below:
 
```js
"use strict";

import redis from "redis";
import promise from "bluebird";
import env from "node-env-file";

env("./.env");

const REDIS_URL = process.env.REDIS_URL;

promise.promisifyAll(redis.RedisClient.prototype);
promise.promisifyAll(redis.Multi.prototype);

export let client = () => {
    return new Promise((resolve, reject) => {
        let connector = redis.createClient(REDIS_URL);

        connector.on("error", () => {
            reject("Redis Connection failed");
        });

        connector.on("connect", () => {
            resolve(connector);
        });
    });
};
```

In the code snippet above, we did the following:

1. Imported the Redis, Bluebird and node-env-file modules
2. Set the environment file
3. Promisify the Redis module
4. Created a function that returns the Redis client or an error 
5. Exported the client

Since the connection to the Redis server is asynchronous, there is a high chance that our Redis client might not have been created and returned before we need it, this can be disastrous! Therefore to prevent a problem, the `client()` function returns a promise that either resolves with the Redis client or rejects with an error.

The client will be used to publish messages, subscribe to channels and listen for messages and to store published messages so that they are available after the broadcast.

Awesome right?!

### Helper Functions ###

Now, we are going to declare and export some functions that we will use later during this tutorial. The reason why we are creating this helper functions, is to make our code base more readable and well organised. Our helper functions are going to help communicate with Redis to perform various actions which include

- Fetching all chat messages
- Storing messages using list data type
- Fetching all users
- Adding users using set data type
- Deleting a user

Create a file `functions.js` in `lib` folder i.e `lib/functions.js` and add the code snippet below 

```js
"use strict";

import { client } from "../lib/redis";

export let fetchMessages = () => {
    return new Promise((resolve, reject) => {
        client().then(
            res => {
                res.lrangeAsync("messages", 0, -1).then(
                    messages => {
                        resolve(messages);
                    },
                    err => {
                        reject(err);
                    }
                );
            },
            err => {
                reject("Redis connection failed: " + err);
            }
        );
    });
};

export let addMessage = message => {
    return new Promise((resolve, reject) => {
        client().then(
            res => {
                res
                    .multi()
                    .rpush("messages", message)
                    .execAsync()
                    .then(
                        res => {
                            resolve(res);
                        },
                        err => {
                            reject(err);
                        }
                    );
            },
            err => {
                reject("Redis connection failed: " + err);
            }
        );
    });
};

export let fetchActiveUsers = () => {
    return new Promise((resolve, reject) => {
        client().then(
            res => {
                res.smembersAsync("users").then(
                    users => {
                        resolve(users);
                    },
                    err => {
                        reject(err);
                    }
                );
            },
            err => {
                reject("Redis connection failed: " + err);
            }
        );
    });
};

export let addActiveUser = user => {
    return new Promise((resolve, reject) => {
        client().then(
            res => {
                res
                    .multi()
                    .sadd("users", user)
                    .execAsync()
                    .then(
                        res => {
                            if (res[0] === 1) {
                                resolve("User added");
                            }

                            reject("User already in list");
                        },
                        err => {
                            reject(err);
                        }
                    );
            },
            err => {
                reject("Redis connection failed: " + err);
            }
        );
    });
};

export let removeActiveUser = user => {
    return new Promise((resolve, reject) => {
        client().then(
            res => {
                res
                    .multi()
                    .srem("users", user)
                    .execAsync()
                    .then(
                        res => {
                            if (res === 1) {
                                resolve("User removed");
                            }
                            reject("User is not in list");
                        },
                        err => {
                            reject(err);
                        }
                    );
            },
            err => {
                reject("Redis connection failed: " + err);
            }
        );
    });
};
```

in the code snippet above, we imported the Redis client function and declared five functions: `fetchMessages()`, `addMessage()`, `fetchActiveUsers()`, `addActiveUser()` and `removeActiveUser()`. 

Before we continue, you might want to catch up on Redis data types [here](). Let's quickly take a look at what is happening in each function

- `fetchMessages()`: This function returns a promise that resolves with an array of messages or rejects with an error. Once `client()` promise has been resolved, it fetches all the messages in the list `messages` using the promisified **LRANGE** command `lrangeAsync()`

- `addMessage()`: This function returns a promise that resolves with the length of the list added or rejects with an error message. Once `client()` promise has been resolved, it makes use of a promisified transaction, which queues up the **RPUSH** command that inserts message into the list `messages` and execute.

- `fetchActiveUsers()`: This function returns a promise that resolves with an array of users or rejects with an error. Once `client()` promise has been resolved, it uses the promisified **SMEMBER** command `smemberAsync()` to fetch all users in the set `users`

- `addActiveUser()`: Once `client()` promise has been resolved, this function uses a promisified transaction which queues up the **SADD** command that inserts a user into the set `users` and execute. It returns a promise that resolves with the number of element added to the set or rejects with an error message. A Redis set doesn't allow repetition of elements, therefore it makes it more convenient to store unique elements like usernames.  

- `removeActiveUser()`: Once `client()` promise has been resolved, this function uses a promisified transaction that queues up the **SREM** command that removes a user from the set `users` and then execute. This function returns a promise that resolves with the number of elements removed or rejects with an error message 

### Setting up the routes ###

Routes basically handle how our web app send HTTP responses to various endpoints . A route usually has a path (e.g '/messages'), a verb (e.g GET) and a handler function. For this tutorial, we are going to need routes for the following

- The homepage of the app
- The chat room
- Fetching all the messages
- Sending a message
- Adding a user to the chat room
- Removing a user from the chat room

Create a file `routes.js` in the `server` folder created earlier , i.e `server/routes.js` and add the code below into it

```js
"use strict";

import express from "express";
import { client } from "../lib/redis";
import * as helper from "../lib/functions";

const router = express.Router();

let fetchMessages = () => {
    return helper.fetchMessages().then(
        res => {
            return res;
        },
        err => {
            console.log(err);
        }
    );
};

let fetchUsers = () => {
    return helper.fetchActiveUsers().then(
        res => {
            return res;
        },
        err => {
            console.log(err);
        }
    );
};

```

In the code snippet above, we did the following

1. Imported Express, the Redis client and our helper functions
2. Created an instance of Express Router
3. Created two functions that return messages and active users stored on Redis, using the `fetchMessages()` and `fetchActiveUsers()` helper functions

Next, let's create some of our app routes, paste the code snippet below into `routes.js`

```js
export let home = router.get("/", (req, res) => {
    res.render("index", { title: "Chat Room" });
});

export let chatRoom = router.get("/chat/:username", (req, res) => {
    res.render("room", { user: req.params.username });
});

export let messages = router.get("/messages", (req, res) => {
    fetchMessages().then(messages => {
        res.send(messages);
    });
});

export let users = router.get("/users", (req, res) => {
    fetchUsers().then(u => {
        res.send(u);
    });
});

```

In the code snippet above, we created and exported the routes for the following

- Displaying the homepage
- Displaying the chat room
- Returning all messages to the client
- Returning all active users to the client

Let's create more routes that will be needed in the app, paste the code snippet below to `routes.js`

```js

export let createUser = router.post("/user", (req, res) => {
    let users;
    let user = req.body.user;

    fetchUsers().then(u => {
        users = u;
        if (users.indexOf(user) === -1) {
            helper.addActiveUser(user).then(
                () => {
                    client().then(
                        client => {
                            let msg = {
                                message:
                                    req.body.user +
                                    " just joined the chat room",
                                user: "system"
                            };

                            client.publish("chatMessages", JSON.stringify(msg));
                            client.publish(
                                "activeUsers",
                                JSON.stringify(fetchUsers())
                            );

                            helper.addMessage(JSON.stringify(msg)).then(
                                () => {
                                    res.send({
                                        status: 200,
                                        message: "User joined"
                                    });
                                },
                                err => {
                                    console.log(err);
                                }
                            );
                        },
                        err => {
                            console.log(err);
                        }
                    );
                },
                err => {
                    console.log(err);
                }
            );
        } else {
            res.send({ status: 403, message: "User already exist" });
        }
    });
});

export let deleteUser = router.delete("/user", (req, res) => {
    let users;
    let user = req.body.user;

    fetchUsers().then(u => {
        users = u;

        if (users.indexOf(user) !== -1) {
            helper.removeActiveUser(user).then(
                () => {
                    client().then(
                        client => {
                            let msg = {
                                message: req.body.user + " just left the chat room",
                                user: "system"
                            };

                            client.publish("chatMessages", JSON.stringify(msg));
                            client.publish(
                                "activeUsers",
                                JSON.stringify(fetchUsers())
                            );

                            helper.addMessage(JSON.stringify(msg)).then(
                                () => {
                                    res.send({
                                        status: 200,
                                        message: "User removed"
                                    });
                                },
                                err => {
                                    console.log(err);
                                }
                            );
                        },
                        err => {
                            console.log(err);
                        }
                    );
                },
                err => {
                    console.log(err);
                }
            );
        } else {
            res.send({ status: 403, message: "User does not exist" });
        }
    });
});

export let createMessage = router.post("/message", (req, res) => {
    let msg = {
        message: req.body.msg,
        user: req.body.user
    };

    client().then(
        client => {
            client.publish("chatMessages", JSON.stringify(msg));

            helper.addMessage(JSON.stringify(msg)).then(
                () => {
                    res.send({
                        status: 200,
                        message: "Message sent"
                    });
                },
                err => {
                    console.log(err);
                }
            );
        },
        err => {
            console.log(err);
        }
    );
});

```

In the code snippet above, we created and exported the routes for the following

- Creating a user
- Deleting a user
- Creating a message

Let's take a look at each of the routes above.

- `createUser`: This route handles adding a user to active users. Once a user has been added, a message announcing the new user to chat room and the updated active users are published using the Redis client. After that, the new message is then stored in Redis and a HTTP response is sent.

-`deleteUser`: This route handles removing a user from active users. After the user is removed from the set `users` on Redis, a message announcing that the user has left the chat room and the the updated active users are published using the Redis client. Finally, the message is then stored on Redis and a HTTP response is sent.

- `createMessage`: This route deals with messages sent by users in the chat room. Once a message is sent, it is published using the Redis client and then stored on Redis.

### Setting up the server ###

For this tutorial, we will use Express as our Node framework. Express is a minimal and flexible framework that provides a robust set of features for web and mobile applications. Create a folder `server` and create a file `server.js` in it, i.e `server/server.js` and copy the code snippet below into it:

```js
"use strict";

import express from "express";
import bodyParser from "body-parser";
import socket from "socket.io";
import path from "path";
import env from "node-env-file";
import { client } from "../lib/redis";
import * as routes from "./routes";

env(".env");

const PORT = process.env.APP_PORT;

const app = express();

// view engine setup
app.set("views", path.join(__dirname, "../public/views"));
app.set("view engine", "pug");

// static files folder setup
app.use(express.static(path.join(__dirname, "../public/assets")));

// Middleware to parse request body
app.use(
    bodyParser.urlencoded({
        extended: true
    })
);

```
In the code snippet above, we did the following

1. Imported Express, bodyParser, socket.io, path, node-env-file modules
2. Imported the Redis client we created in `lib/redis.js`
3. Imported the routes in `server/routes.js`
4. Set the environment file
2. Created the instance of Express
6. Set Pug as our view template engine and configured the path to our templates
7. Configured the path of our static files (stylesheets, scripts, etc)
8. Configured a middleware to use body-parser to parse the request body

Next, we are going to subscribe to channels using the Redis client and listen for messages published on those channels. Once someone sends a message or joins the chat room, we will send the message or updated users list to all users using Socket.io. Copy the code snippet below to server.js:

```js
client().then(
    res => {

        // App routes
        app.get("/", routes.home);
        app.get("/chat/:username", routes.chatRoom);
        app.get("/messages", routes.messages);
        app.get("/users", routes.users);
        app.post("/user", routes.createUser);
        app.delete("/user", routes.deleteUser);
        app.post("/message", routes.createMessage);

        //Start the server
        const server = app.listen(PORT, () => {
            console.log("Server Started");
        });

        const io = socket.listen(server);

        // //listen and emit messages and user events (leave or join) using socket.io
        io.on("connection", socket => {
        	
        	// subscribe to Pub/Sub channels
            res.subscribe("chatMessages");
            res.subscribe("activeUsers");
                    
            res.on("message", (channel, message) => {
                if (channel === "chatMessages") {
                    socket.emit("message", JSON.parse(message));
                } else {
                    socket.emit("users", JSON.parse(message));
                }
            });
        });
    },
    err => {
        console.log("Redis connection failed: ", err);
    }
);

```
We subscribed to two channels: `chatMessages` and `activeUsers`. Whenever a message is published, an event `message` is triggered. In the code snippet above, we did the following
 
1. We declared the application endpoints
2. We started the server
3. We created an instance of Socket.io using the server we started
4. Once Socket.io establishes connection, we used the Redis client to subscribe to `chatMessages` and `activeUsers` channels
5. We checked for any `message` event triggered by a published message.
6. We then broadcasted the message with Socket.io, using `message` event for messages from `chatMessage` channel and `users` event for messages from `activeUsers` channel

The `/` endpoint displays the homepage of the app, by rendering the index view template, while the `/chat/:username` renders the chat room using the room view template. We will cover the view templates later in this tutorial.

The GET `/messages` endpoint returns the history of messages shared in the chat room while GET `/users` returns the list of active users stored.

The POST `/user` endpoint handles adding users to active users. The POST `/message` handles publishing and storing of messages sent by users. The DELETE `/user` endpoint removes users from active users. 

### The Frontend ###

Remember we said something about Pug (formerly known as Jade) earlier on? Yes! We are using it as our view template engine, alongside CSS & JQuery to build the front end client for the chat room.

Create a folder views and a file in it master.pug so that the path is views/master.pug. This file will be the parent template, which other child templates will inherit. Copy the code snippet below:

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

When we extend this file, we can override specific areas labeled blocks. In the code snippet above, we have two blocks: contentand script. We will be extending the file in our child templates using those blocks. Also, Pug relies on indentation to create parent and child elements; therefore, we have to pay attention to that. You can check out pug's documentation.

Next, we create index.pug, the template file we called in our GET /endpoint. It will hold the structure of the homepage. Copy the code snippet below:

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
In the code snippet above, we are extending master.pug and overriding the block content to hold the structure we want. For the homepage, we are going to display a form to collect the username and submit it.

Next, let’s create the template file for the chat room, create file room.pug and paste the code snippet below:

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
Here, we added the socket.io script and the script handling the room, by overriding the block script.

Next, we need to style the structure we have defined above. Create a stylesheet style.css in public/css, so that the path is public/css/style.css and paste below into it:

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

First, let’s create the script to handle username registration. Create file script.js and paste the code snippet below:
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

Once the user submits the form, a POST request is sent to /userwith the username. If the response status is 200, we redirect to the chat room, else, we display a message that disappears after 2 seconds.

Next, let’s power our chat room. We need to display the chat history, active users, update the message wall when another user sends a message and also update the users list when a user joins or leave. Create a file chat.js in public/js folder and copy the code snippet below:

```js
$(document).ready(function () {

    const socket = io();

    //Get the chat history
    $.get('/messages')
        .done(function (res) {
            $.each(res, function (index, value) {
                value = JSON.parse(value);
                console.log(value);
                if (value.user === 'system') {
                    $('.chat').append('<p class="item"><span class="system">' + value.user + ': </span><span class="msg">' + value.message + '</span></p>');
                } else {
                    $('.chat').append('<p class="item"><span class="user">' + value.user + ': </span><span class="msg">' + value.message + '</span></p>');
                }
            });

            $('.chat').animate({'scrollTop': 999999}, 200);
        });

    //Get the list of all active users
    $.get('/users')
        .done(function (res) {
            $.each(res, function (index, value) {
                $('.users').append('<p class="item">' + value + '</span>');
            });
        });

    //Message box submission using the 'Enter' key
    $('.room .message').on("keydown", function (e) {

        if (e.keyCode === 13) {
            e.preventDefault();

            let user = $('.name').val();
            let msg = $('.message').val();

            $.post('/message', {user: user, msg: msg})
                .done(function () {
                    $('.message').val('');
                    $('.submit').prop('disabled', false);
                });
        }

    });

    //Message box submission
    $('.room').on("submit", function (e) {
        e.preventDefault();

        let user = $('.name').val();
        let msg = $('.message').val();

        $.post('/message', {user: user, msg: msg})
            .done(function () {
                $('.message').val('');
                $('.submit').prop('disabled', false);
            });
    });

    //Remove user from active user list just before closing the window
    window.onbeforeunload = function () {
        $.ajax({
            method: 'DELETE',
            url: '/user',
            data: {user: $('.name').val()}
        })
            .done(function (msg) {
                alert(msg.message);
            });

        return null;
    };

    //Listens to when a chat message is broadcasted and displays it
    socket.on('message', function (data) {
        console.log(data);
        let username = data.user;
        let message = data.message;
        if (username === 'system') {
            $('.chat').append('<p class="item"><span class="system">' + username + ': </span><span class="msg">' + message + '</span></p>');
        } else {
            $('.chat').append('<p class="item"><span class="user">' + username + ': </span><span class="msg">' + message + '</span></p>');
        }

        $('.chat').animate({'scrollTop': 999999}, 200);
    });

    //Listens to when the active user list is updated and broadcasted
    socket.on('users', function (data) {
        $('.users .item').remove();

        $.each(data, function (index, value) {
            $('.users').append('<p class="item">' + value + '</span>');
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

Before we deploy the application for usage, we need to quickly edit package.json in the root folder, so that we can start the app automatically, when we deploy. Add this to the file:

```text
"scripts": {
    "babel-node": "babel-node --presets=env",
    "start": "nodemon --exec npm run babel-node -- ./server/server.js"
}

```

Finally, time to deploy! We will use a simple tool called now by Zeit. Let’s quickly install this, run this in your terminal:

```bash
npm install -g now

```

Once the installation is done, navigate to the project root folder in your terminal and run the now command. If it is your first time, you will be prompted to create an account. Once you are done, run the now command again, a URL will be generated and your project files uploaded.

*insert image*

You can now access the simple application via the URL generated. Pretty straightforward!

*insert image*

### Conclusion ###
We have been able to focus more on building our chat room, without having to worry about infrastructure. The ability to provision resources very fast, all from a single dashboard means we get to focus more on writing code. Don’t stop here, get creative and improve on the code in this tutorial, you can find the source code for this tutorial on [Github]().
