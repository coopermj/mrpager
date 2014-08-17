var express = require('express');
var path = require('path');
var session = require('express-session');
var moment = require('moment');
var nconf = require('nconf');
var twilio = require('twilio');
var mongoose = require('mongoose');
var uriUtil = require('mongodb-uri');
var passport = require('passport')
  , LocalStrategy = require('passport-local').Strategy;
var cookieParser = require('cookie-parser');



// nconf is going to store our configuration items in config.json
nconf.file({
    file: 'config.json',
    dir: __dirname,
    search: false
  });

var smsText = nconf.get('smsText');

passport.use(new LocalStrategy(
  function(username, password, done) {
    mruser = nconf.get('mrUser');
    mrpass = nconf.get('mrPass');
    if (mruser != username) {
      return done(null, false, { message: 'Incorrect username.'});
    }
    if (mrpass != password) {
      return done(null, false, { message: 'Incorrect password'});
    }
    return done(null, mruser);
    /*
    User.findOne({ username: username }, function (err, user) {
      if (err) { return done(err); }
      if (!user) {
        return done(null, false, { message: 'Incorrect username.' });
      }
      if (!user.validPassword(password)) {
        return done(null, false, { message: 'Incorrect password.' });
      }
      return done(null, user);
    });*/
    //return done(null, "joeBob");
  }
));

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});

// if we're using AppFog, we may be using a bound database
if (process.env.VCAP_SERVICES) {
  //console.log('process env: ' + process.env.VCAP_SERVICES);
  var env = JSON.parse(process.env.VCAP_SERVICES);
  var mongo = env['mongodb2-2.4.8'][0]['credentials'];
}
else {
  var mongo = {
    'hostname': nconf.get('mongoHost'),
    'port': nconf.get('mongoPort'),
    'username': nconf.get('mongoUser'),
    'password': nconf.get('mongoPass'),
    'name': '',
    'db': nconf.get('mongoDB')
  }
}

var generate_mongo_url = function(obj){
    obj.hostname = (obj.hostname || 'localhost');
    obj.port = (obj.port || 27017);
    obj.db = (obj.db || 'test');
    if(obj.username && obj.password){
        return "mongodb://" + obj.username + ":" + obj.password + "@" + obj.hostname + ":" + obj.port + "/" + obj.db;
    }
    else{
        return "mongodb://" + obj.hostname + ":" + obj.port + "/" + obj.db;
    }
}
var mongourl = generate_mongo_url(mongo);
var mongooseUri = uriUtil.formatMongoose(mongourl);



// Create a new REST API client to make authenticated requests against the
// twilio back end
var twiSID = nconf.get('TWILIO_ACCOUNT_SID');
var twiAuthToken = nconf.get('TWILIO_AUTH_TOKEN');
var client = new twilio.RestClient(twiSID, twiAuthToken);
var myPhoneNo = nconf.get('twilioNumber')


// set up our database connection for logging
var options = { server: { socketOptions: { keepAlive: 1, connectTimeoutMS: 30000 } }, 
                replset: { socketOptions: { keepAlive: 1, connectTimeoutMS : 30000 } } };       

/*
var mongoUser = nconf.get('mongoUser');
var mongoPass = nconf.get('mongoPass');
var mongoHost = nconf.get('mongoHost');
var mongoPort = nconf.get('mongoPort');
var mongoDB = nconf.get('mongoDB');
var mongodbUri = 'mongodb://' + mongoUser + ':' + mongoPass + '@' + mongoHost + ':' + mongoPort + '/' + mongoDB;
//var mongodbUri = 'mongodb://user:pass@host:port/db';
var mongooseUri = uriUtil.formatMongoose(mongodbUri);
*/

mongoose.connect(mongooseUri, options);
var db = mongoose.connection;             
 
db.on('error', console.error.bind(console, 'connection error:'));  

var eventSchema;
var Event;

db.once('open', function() {
  // Create your schemas and models here.
  eventSchema =  mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  outsideIP: String,
  insideIP: String,
  eventType: String,
  eventTypeDetailed: String,
  Instance: String,
  custNo: String,
  custPhoneNo: String,
  custName: String,
  custIssue: String,
  msgSid: String,
  status: String
  });

  customerSchema = mongoose.Schema({
      timestamp: { type: Date, default: Date.now },
      logged:  { type: Date, default: Date.now },
      outsideIP: String,
      insideIP: String,
      custPhoneNo: String,
      custName: String,
      custIssue: String,
      status: String,
      pageCount: { type: Number, default: 0 },
      lastPaged: Date,
      firstPaged: Date,
      arrived: Date,
      reply: { type: String, default: '' }
  });

  Event = mongoose.model('Event', eventSchema);
  Customer = mongoose.model('Customer', customerSchema);

});

/*
 * body-parser is a piece of express middleware that 
 *   reads a form's input and stores it as a javascript
 *   object accessible through `req.body` 
 *
 * 'body-parser' must be installed (via `npm install --save body-parser`)
 * For more info see: https://github.com/expressjs/body-parser
 */
var bodyParser = require('body-parser');

// create our app
var app = express();

// instruct the app to use the `bodyParser()` middleware for all routes
//app.use(bodyParser());

app.use(cookieParser('optional secret and fun string'));
app.use(session({secret: 'keyboard cat ftW1', saveUninitialized: true, resave: true}))
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(passport.initialize());
app.use(passport.session());

// does not protect behind passport.js 
app.use('/public', express.static('public'));
app.use('/private', express.static('private'));

app.all('/private/*', function(req,res,next) {
  if (req.session.loggedIn) {
    next(); // go to next route
  } else {
    res.redirect("/public/login.html");
  }
});
/* failed
app.use('/public', function(req,res,next) {
  console.log('req.user: ' + req.user);
  if (req.user) {
    //return express.static('public');
    return express.static(path.join(__dirname, 'public'));
    //app.use('/public', express.static('public'));
  } else {
    res.redirect('/login/login.html');
  }
});*/

//app.use(express.session({secret: '59B93087-78BC-4EB9-993A-DD17C844F6C9'}));


var pagee = [];


//Event.add()

// A browser's default method is 'GET', so this
// is the route that express uses when we visit
// our site initially.
app.get('/', isLoggedIn, function(req, res){
  // The form's action is '/' and its method is 'POST',
  // so the `app.post('/', ...` route will receive the
  // result of our form
  /*var html = '<form action="/" method="post">' +
               'Enter your name:' +
               '<input type="text" name="userName" placeholder="..." />' +
               '<br>' +
               'Phone number: ' +
               '<input type="text" name="phoneNo" placeholder="xxx-xxx-xxxx" />' +
               '<br>' +
               '<button type="submit">Submit</button>' +
            '</form>';*/

  var html = '<title>Welcome to Mr. Pager</title>\n' +
          '<a href="/private/entry.html">Concierge Page</a>\n' +
          '<a href="/private/pagelist.html">Service Counter Page</a>\n' +
          '<a href="/public/status.html">Status Board</a>\n' + 
          '<a href="/private/admin.html">Config</a>\n' +
          '<a href="/logout">Log out</a>\n';
               
  res.send(html);
});

app.post('/login',
  passport.authenticate('local', { successRedirect: '/',
                                   failureRedirect: '/public/login.html',
                                   failureFlash: false })
);

app.get('/pagetext', function(req, res) {
  res.send(smsText);
});

app.get('/currentlist', function(req,res) {

  var html = '<head><link rel="stylesheet" type="text/css" href="style.css"></head>';
  
  html += '<table>\n';
  html += '<thead>\n';
  html += '<tr><th>First Name</th><th>Cell No</th><th>Paged</th></tr>\n'
  html += '</thead>\n';


  html += '<tbody>\n';

  Customer.find({status: 'paged'}, null, {_id: -1}, function(err,customers) {
    customers.forEach(function(customer) {
      var namebit = [];
      namebit = customer.custName.split(' ');
      var firstName = namebit[0];


      var thisPhone = customer.custPhoneNo;
      var lastFour = thisPhone.substr(thisPhone.length - 4);
      var phoneStr = 'xxx.xxx.' + lastFour;

      var pagedMoment = moment(customer.firstPaged);
      var pagedStr = pagedMoment.format('h:mm a');

      html += '<tr>\n';
      //html += '<td>\n' + i + '</td>\n';
      html += '<td>\n' + firstName + '</td>\n';
      html += '<td>\n' + phoneStr + '</td>\n';
      html += '<td>\n' + pagedStr + '</td>\n';

      html += '</tr>\n';

    });

    html += '</tbody>\n';
    html += '</table>\n';

    res.send(html);
  });



});

app.get('/dopage:id', function(req, res) {
  /*return Todo.findById(req.params.id, function(err, todo) {
    if (!err) {
      return res.send(todo);
    }
  });*/
  var id = req.params.id;
  console.log('page: ', req.params.id);
  //res.send('got page: ' + req.params.id);
  var rightnow = new Date();
  /*pagee[id].paged = rightnow;
  pagee[id].pageCount++;

  var cleanNo = pagee[id].phoneNo.replace(/\D/g,'');
  var phoneNo = '+1' + cleanNo;*/

  Customer.findById(id, function(err,customer) {
    if (err) {
      res.send(err);
      return;
    }
    var phoneNo = customer.custPhoneNo;
    console.log('pageCount: ' + customer.pageCount);
    
    if (customer.pageCount == 0) {
      customer.firstPaged = rightnow;
    }

    customer.lastPaged = rightnow;
    customer.status = 'paged';
    customer.pageCount = customer.pageCount + 1;

    customer.save(function (err) {
      console.log('in save');
      if (err) {
        console.log(err);
        res.send(err);
        return;
      }
      console.log('phoneNo: ' + phoneNo);
      // do sms and log the event to the master log

      client.sms.messages.create({ to:phoneNo, from:myPhoneNo, body:smsText }, function(error, message) {
          // The HTTP request to Twilio will run asynchronously. This callback
          // function will be called when a response is received from Twilio
          // The "error" variable will contain error information, if any.
          // If the request was successful, this value will be "falsy"
          if (!error) {
              // The second argument to the callback will contain the information
              // sent back by Twilio for the request. In this case, it is the
              // information about the text messsage you just sent:

              // this is all stuff for just logging!

              var clientip = req.headers['x-forwarded-for'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               req.connection.socket.remoteAddress;

             Customer.find({status: 'paged'}, null, {_id: -1}, function(err,customers) {

                html = buildPagedTable(customers);
                res.send(html);
                //console.log(html);
              });

              console.log('Success! The SID for this SMS message is:');
              console.log(message.sid);
       
              console.log('Message sent on:');
              console.log(message.dateCreated);

              var thisPageEvent = new Event({
                  outsideIP: clientip,
                  insideIP: 'ip',
                  eventType: 'page',
                  eventTypeDetailed: 'page-' + customer.pageCount,
                  Instance: customer.pageCount,
                  custNo: id,
                  custPhoneNo: phoneNo,
                  custName: customer.custName,
                  custIssue: customer.custIssue,
                  msgSid: message.sid,
                  status: 'success'
              });
              thisPageEvent.save(function(err, thisPageEvent) {
                if (err) return console.error(err);
                console.dir(thisPageEvent);

              });
          } else {
              console.log('Oops! There was an error.');
              var thisPageEvent = new Event({
                  outsideIP: clientip,
                  insideIP: 'ip',
                  eventType: 'page',
                  eventTypeDetailed: 'page-' + customer.pageCount,
                  Instance: customer.pageCount,
                  custNo: id,
                  custPhoneNo: phoneNo,
                  custName: customer.userName,
                  custIssue: customer.complaint,
                  msgSid: error,
                  status: 'error'
              });
              thisPageEvent.save(function(err, thisPageEvent) {
                if (err) return console.error(err);
                console.dir(thisPageEvent);
                
              });
          }
      });

      

    });

  });



  // have twilio place the page
  

  // post our action to our database connection for later review
  

});

app.get('/doarrived:id', function(req, res) {
  var id = req.params.id;
  console.log('answered: ', req.params.id);
  //res.send('answered: ' + req.params.id);
  var rightnow = new Date();
  //pagee[id].answered = rightnow;


  var clientip = req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           req.connection.socket.remoteAddress;

  Customer.findById(id, function(err,customer) {
    if (err) {
      res.send(err);
      return;
    }
    customer.status = 'arrived';
    customer.arrived = rightnow;

    customer.save(function (err) {
      console.log('in save');
      if (err) {
        console.log(err);
        res.send(err);
        return;
      }
      else {
        Customer.find({status: 'paged'}, null, {_id: -1}, function(err,customers) {
          var html = buildPagedTable(customers);
          res.send(html);
          //console.log(html);
        }); 
        //res.send('arrived: ' + req.params.id);
      }
    });

    var thisArriveEvent = new Event({
      outsideIP: clientip,
      insideIP: 'ip',
      eventType: 'arrive',
      eventTypeDetailed: 'arrive' + customer.pageCount,
      Instance: '',
      custNo: id,
      custPhoneNo: customer.phoneNo,
      custName: customer.custName,
      custIssue: customer.complaint,
      msgSid: '',
      status: ''
    });
    thisArriveEvent.save(function(err, thisPageEvent) {
      if (err) return console.error(err);
      console.dir(thisPageEvent);
    });

  });

  
});

// route middleware to make sure a user is logged in
function isLoggedIn(req, res, next) {

  // if user is authenticated in the session, carry on 
  if (req.isAuthenticated())
    return next();

  // if they aren't redirect them to the home page
  res.redirect('/public/login.html');
}


app.get('/login', function(req, res, next) {
  passport.authenticate('local', function(err, user, info) {
    if (err) { return next(err); }
    if (!user) { return res.redirect('/login'); }
    req.logIn(user, function(err) {
      if (err) { return next(err); }
      return res.redirect('/users/' + user.username);
    });
  })(req, res, next);
});

app.get('/logout', function(req, res) {
    req.logout();
    res.redirect('/public/login.html');
  });

app.get('/doremove:id', isLoggedIn, function(req, res) {
  var id = req.params.id;
  console.log('remove: ', req.params.id);
  
  /*var rightnow = new Date();
  pagee[id].answered = rightnow;*/
  

  var clientip = req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           req.connection.socket.remoteAddress;

  Customer.findById(id, function(err,customer) {
    if (err) {
      res.send(err);
      return;
    }
    var phoneNo = customer.custPhoneNo;
    


    //customer.lastPaged = rightnow;
    customer.status = 'removed';
    //customer.pageCount = customer.pageCount + 1;

    customer.save(function (err) {
      console.log('in save');
      if (err) {
        console.log(err);
        res.send(err);
        return;
      }
      else {
        res.send('removed: ' + req.params.id);
      }
    });
  });

/*
  var thisArriveEvent = new Event({
      outsideIP: clientip,
      insideIP: 'ip',
      eventType: 'remove',
      eventTypeDetailed: 'remove-' + id,
      Instance: '',
      custNo: id,
      custPhoneNo: ,
      custName: pagee[id].userName,
      custIssue: pagee[id].complaint,
      msgSid: '',
      status: ''
  });
  thisArriveEvent.save(function(err, thisPageEvent) {
    if (err) return console.error(err);
    console.dir(thisPageEvent);

  });

  // here's a tip — do your logging lookups BEFORE deleting! ;)
  delete pagee[id];*/

});

app.get('/average', isLoggedIn, function(req, res) {
  var totalTime=0;
  var totalPaged=0;

  Customer.find({status: 'paged'}, null, {_id: -1}, function(err,customers) {
    customers.forEach(function(customer) {
      totalPaged++;
      totalTime += customer.firstPaged - customer.logged;
    });

    var avgTimeMilSec = totalTime / totalPaged;
    var avgTimeMin = avgTimeMilSec / 1000 / 60; // average time in minutes
    var html;

    if (!avgTimeMin) {
      res.send('No current wait estimate');
    }
    else {
      if (avgTimeMin.toFixed(0) == 1) {
        html = avgTimeMin.toFixed(0) + ' minute'; // limit to 0 decimal places
      }
      else {
        html = avgTimeMin.toFixed(0) + ' minutes'; // limit to 0 decimal places
      }
     
    res.send(html);
  }

  });


});

//bubbat

function buildTableToPage(customers) {
  var maxComplaintLength = 25;
  var thisIndex = 0;

  /*
    customerSchema = mongoose.Schema({
      timestamp: { type: Date, default: Date.now },
      outsideIP: String,
      insideIP: String,
      customer.: String,
      custName: String,
      custIssue: String,
      status: String
  });
*/
 
  var html;


    html = '<head><link rel="stylesheet" type="text/css" href="style.css"></head>';
    //html += '<h3>Unpaged</h3>';
    html += '<table>\n';
    html += '<thead>\n';
    html += '<tr><th>#</th><th>Name</th><th>Cell No</th><th>CheckIn Time</th><th>Summary</th><th colspan="2">Actions</th></tr>\n'
    html += '</thead>\n';

    html += '<tbody>\n';


    customers.forEach(function(customer) {
      //console.log('custName: ' + customer.custName);

      thisIndex++;

      html += '<tr>\n';
      //html += '<td>' + customer._id + '</td>\n';
      html += '<td>' + thisIndex + '</td>\n';
      html += '<td>' + customer.custName + '</td>\n';
      html += '<td>' + customer.custPhoneNo + '</td>\n';
      html += '<td>' + customer.logged.toLocaleTimeString() + '</td>\n';
      html += '<td>' + customer.custIssue.substring(0,maxComplaintLength) + '</td>\n';
      html += '<td>\n' + '<button type="button" id="' + customer._id + '"  onclick="doPage(' + '\'' + customer._id + '\'' + ')" >' + 'Page' + '</button>' +'</td>\n';
      html += '<td>\n' + '<button type="button" onclick="doRemove(' + '\'' + customer._id + '\'' + ')" >' + 'Remove' + '</button>' +'</td>\n';
  
      html += '</tr>\n';
      //console.log(html);



    });

    html += '</tbody>\n';
    html += '</table>\n';
    console.log(html);
    return html;
  


};



app.get('/waitlist', isLoggedIn, function(req, res) {

var html;
var maxComplaintLength = 25;


  Customer.find({status: 'new'}, null, {_id: -1}, function(err,customers) {
    html = buildTableToPage(customers);
    res.send(html);
  });

});

function buildPagedTable (customers) {

  //console.log('in bpt');

  var html='';
  var maxComplaintLength = 25;
  var thisIndex = 0;

  html += '<table>\n';
  html += '<thead>\n';
  html += '<tr><th>#</th><th>Name</th><th>Cell No</th><th>CheckIn Time</th><th>Last Paged</th><th>Summary</th><th colspan="3">Actions</th></tr>\n'
  html += '</thead>\n';

  

  html += '<tbody>\n';


    customers.forEach(function(customer) {
      //console.log('custNamePaged: ' + customer.custName);
      thisIndex++;

      html += '<tr>\n';
      // uncomment if you want the GUID in the table 
      //html += '<td>' + customer._id + '</td>\n';
      html += '<td>' + thisIndex + '</td>\n';
      html += '<td>' + customer.custName + '</td>\n';
      html += '<td>' + customer.custPhoneNo + '</td>\n';
      html += '<td>' + customer.logged.toLocaleTimeString() + '</td>\n';
      html += '<td>' + customer.lastPaged.toLocaleTimeString() + '</td>\n';
      html += '<td>' + customer.custIssue.substring(0,maxComplaintLength) + '</td>\n';
    
      var thisPageCount =  customer.pageCount + 1;
      var pageLabel = 'Page x' + thisPageCount;
      html += '<td>\n' + '<button type="button" id="' + customer._id + '"  onclick="doPage(' + '\'' + customer._id + '\'' + ')" >' + pageLabel + '</button>' +'</td>\n';
      html += '<td>\n' + '<button type="button" onclick="doArrived(' + '\'' + customer._id + '\'' + ')" >' + 'Arrived' + '</button>' +'</td>\n';
      html += '<td>\n' + '<button type="button" onclick="doRemove(' + '\'' + customer._id + '\'' + ')" >' + 'Remove' + '</button>' +'</td>\n';

      // we'll put their sms reply at the end so it doesn't move the buttons away for all the choices
      if (customer.reply) {
        html += '<td>' + customer.reply + '</td>\n';  
      }
      
  
      html += '</tr>\n';

    });

    html += '</tbody>\n';
    html += '</table>\n';
    return html;
}

app.get('/pagedlist', function(req, res) {

var html='';
//var maxComplaintLength = 25;

  Customer.find({status: 'paged'}, null, {_id: -1}, function(err,customers) {

    html = buildPagedTable(customers);
    console.log('pl html: ' + html);
    res.send(html);
  });

});

// Receive our updated smsText and save to config
app.post('/postSMS', isLoggedIn, function(req, res) {
  console.log('postSMS');
  var newSMS = req.body.firstPage;
  smsText = newSMS;
  nconf.set('smsText', newSMS);
  nconf.save(function (err) {
    if (err) {
      console.error(err.message);
      return;
    }
    console.log('Configuration saved successfully.');
  });

  res.redirect('/private/admin.html');
});

app.get('/postSMS', function(req, res) {
  console.log('get not post');
});


app.get('/report', isLoggedIn, function(req, res) {
  // I looked at several CSV packages, but none were 
  // straightforward enough when I could just roll my own

  var myCSVC;
  var myCSV;

      /* timestamp: { type: Date, default: Date.now },
      logged:  { type: Date, default: Date.now },
      outsideIP: String,
      insideIP: String,
      custPhoneNo: String,
      custName: String,
      custIssue: String,
      status: String,
      pageCount: { type: Number, default: 0 },
      lastPaged: Date,
      firstPaged: Date,
      arrived: Date */

  Customer.find({}, function(err, customers) {
    myCSV = 'id, Created, EntryIP, CustPhoneNo, CustName, CustIssue, Status, PageCount, LastPaged, FirstPaged, Arrived\n';

    customers.forEach(function(customer) {
      myCSV += '"' + customer._id + '",';
      myCSV += '"' + customer.logged + '",';
      myCSV += '"' + customer.outsideIP + '",';
      myCSV += '"' + customer.custPhoneNo + '",';
      myCSV += '"' + customer.custName + '",';
      myCSV += '"' + customer.custIssue + '",';
      myCSV += '"' + customer.status + '",';
      myCSV += '"' + customer.pageCount + '",';
      myCSV += '"' + customer.lastPaged + '",';
      myCSV += '"' + customer.firstPaged + '",';
      myCSV += '"' + customer.arrived + '",';

      myCSV += '\n';
    });

    var thisDate = new Date();
    console.log(thisDate);
    var dateString = JSON.stringify(thisDate);
    console.log(dateString);
    var filename = 'mrpager-report-' + dateString + '.csv';
    
    res.setHeader('Content-disposition', 'attachment; filename=' + filename);
    res.writeHead(200, { 'Content-Type': 'text/csv' });
    res.write(myCSV);

    var reportEnd = 'mr pager report run at ' + dateString;
    res.end(reportEnd);

  });


});

app.get('/reportlog', isLoggedIn, function(req, res) {
  var EventDoc = mongoose.model('Event', eventSchema);

  /*
   eventSchema =  mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  outsideIP: String,
  insideIP: String,
  eventType: String,
  eventTypeDetailed: String,
  Instance: String,
  custNo: String,
  custPhoneNo: String,
  custName: String,
  custIssue: String,
  msgSid: String,
  status: String
  */

  var eventMap ={};
  var myCSVC;
  var myCSV;
  //doCSV(res, eventMap);
  
  Event.find({}, function(err,events) {
    myCSVC = ('timestamp', 'outsideIP', 'eventType', 'eventTypeDetailed','Instance','custNo','custPhoneNo','custName','custIssue','msgSid','status');
    myCSV = 'timestamp, ' + 'outsideIP, ' + 'eventType, ' + 'eventTypeDetailed, ' + 
      'Instance, ' + 'custNo, ' + 'custPhoneNo, ' + 'custName, ' + 'custIssue, ' + 'msgSid, ' + 'status' + '\n';
    
    events.forEach(function(event) {
      eventMap[event._id] = event;
      var thisOne = eventMap[event._id];

      myCSV += '"' + thisOne.timestamp + '",';
      myCSV += '"' + thisOne.outsideIP + '",';
      myCSV += '"' + thisOne.eventType + '",';
      myCSV += '"' + thisOne.eventTypeDetailed + '",';
      myCSV += '"' + thisOne.Instance + '",';
      myCSV += '"' + thisOne.custNo + '",';
      myCSV += '"' + thisOne.custPhoneNo + '",';
      myCSV += '"' + thisOne.custName + '",';
      myCSV += '"' + thisOne.custIssue + '",';
      myCSV += '"' + thisOne.msgSid + '",';
      myCSV += '"' + thisOne.status + '",';

      myCSV += '\n';
    });

    console.log(myCSV);


    var thisDate = new Date();
    console.log(thisDate);
    var dateString = JSON.stringify(thisDate);
    console.log(dateString);
    var filename = 'mrpager-verbosereport-' + dateString + '.csv';
    
    res.setHeader('Content-disposition', 'attachment; filename=' + filename);
    res.writeHead(200, { 'Content-Type': 'text/csv' });
    res.write(myCSV);

    var reportEnd = 'mr pager verbose report run at ' + dateString;
    res.end(reportEnd);


  });
  
});


app.post('/submitNew', isLoggedIn, function(req, res){
  var userName = req.body.userName;
  var phoneNo = req.body.phoneNo;
  var complaint = req.body.complaint;
  var pageeCount = pagee.length;
  var rightNow = new Date();
  //var html = 'Hello: ' + userName + ' at ' + phoneNo + '.<br>' + '<a href="/">Try again.</a>';

  pagee.push({id: pageeCount, userName: userName, phoneNo: phoneNo, logged: rightNow, complaint: complaint, pageCount: 0, paged: false, answered: false});
  console.log('id: ' + pageeCount);
  console.log('pagee: ' + pagee);
  console.log('pagee.length: ' + pagee.length);

  var clientip = req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           req.connection.socket.remoteAddress;

  var thisSubmitEvent = new Event({
      outsideIP: clientip,
      insideIP: 'ip',
      eventType: 'submit',
      eventTypeDetailed: 'submit',
      Instance: '',
      custNo: pageeCount,
      custPhoneNo: phoneNo,
      custName: userName,
      custIssue: complaint,
      msgSid: '',
      status: ''
  });
  thisSubmitEvent.save(function(err, thisSubmitEvent) {
    if (err) return console.error(err);
    console.dir(thisSubmitEvent);

  });

  var thisSubmitCustomer = new Customer({
      outsideIP: clientip,
      insideIP: 'ip',
      custPhoneNo: phoneNo,
      custName: userName,
      custIssue: complaint,
      status: 'new'
  });
  thisSubmitCustomer.save(function(err, thisSubmitCustomer) {
    if (err) return console.error(err);
    //console.dir(thisSubmitCustomer);

    Customer.find({status: 'new'}, null, {_id: -1}, function(err,customers) {
      var html = buildTableToPage(customers);
      res.send(html);
      //console.log(html);
    });

  });

  
});

app.post('/respondToVoiceCall', function(req, res) {
    //Validate that this request really came from Twilio...
    if (twilio.validateExpressRequest(req, twiAuthToken)) {
        var twiml = new twilio.TwimlResponse();


        twiml.say('Thanks for calling us, but this is an SMS only line. Please give us a call.')
            .play('https://api.twilio.com/cowbell.mp3');

        res.type('text/xml');
        res.send(twiml.toString());

        // retrieve SMS and log it to our system
        // see https://www.twilio.com/docs/api/rest/sms
        
    }
    else {
        res.send('you are not twilio.  Buzz off.');
    }
});

app.get('/incomingSMS', function(req, res) {
  console.log('get incoming SMS');
  res.send('hi');
})

app.post('/incomingSMS', function(req, res) {
  console.log('post - incoming SMS!');

  // twilio is supposed to have a cool feature to validate, but
  // it didn't work for me
  //if (twilio.validateExpressRequest(req, twiAuthToken)) {
    var twiml = new twilio.TwimlResponse();
    var MessageSid = req.body.MessageSid;
    var AccountSid = req.body.AccountSid;
    var From = req.body.From;
    var To = req.body.To;
    var Body = req.body.Body;
    var FromCity = req.body.FromCity;
    var FromState = req.body.FromState
    var FromZip = req.body.FromZip
    var FromCountry = req.body.FromCountry

    

    var searchNum = From.substr(2);

    console.log('searchnum: ' + searchNum);


    Customer.findOne({custPhoneNo: searchNum, status:'paged'}, function(err,customer) {
      
      console.log(customer);

      if (customer.reply) {
        customer.reply += '<hr>' + Body;
      }
      else {
        customer.reply = Body;
      }

      customer.save(function (err) {
        console.log('in save');
        if (err) {
          console.log(err);
          twiml.message('Sorry — your message did not come through. Please come talk to us.');
          res.type('text/xml');
          res.send(twiml.toString());
          return;
        } 
        else {
          twiml.message('Thanks for your message! It has been relayed to our staff.');
          res.type('text/xml');
          res.send(twiml.toString());
        }
      });
    });
  //}
  /*else {
    res.send('you are not twilio.  Buzz off.');
    console.log('rejected request');
  }*/
});

// Catch all for a clean error for anything not handled above
app.all('*', function(req, res){
  res.send(404);
})

app.listen(process.env.VCAP_APP_PORT || 3000);