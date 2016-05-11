/* ***************** Process Wrapper *************** */
/* Firebase presense system for monitor and control  */    

//Dependencies
var Firebase = require("firebase");
var winston = require("winston");
var Chance = require('chance'),
    chance = new Chance();
var _ = require('lodash');
var moment = require('moment-timezone');

/*var logzioWinstonTransport = require('winston-logzio');
var loggerOptions = {
    token: 'HzZCnzaaZkcFEDqrxirsHZJQBBQllETP'
};*/

var logzio = require('logzio-nodejs').createLogger({
    token: 'HzZCnzaaZkcFEDqrxirsHZJQBBQllETP'
});

var logger = new (winston.Logger)({
            "exitOnError" : true,
            "transports" : [
                new (winston.transports.Console)(
                  { "colorize" : true, 
                    "level" : "info", 
                    "silent" : false, 
                    "handleExceptions" : false })
//                new (logzioWinstonTransport)(loggerOptions)
            ]
        });

var Logsene = require('logsene-js')
var logse =  new Logsene ('75051c1b-9363-469e-87ef-472d0eb79acc')

var logzio_level = "info";

logger.log = function(){
  var args = arguments;
  var level = args[0];

  //Add Prefix
  args[1] = prefix + " "+args[1];

  //To Logzio
  if(winston.config.syslog.levels[level] <= winston.config.syslog.levels[logzio_level]){
    var obj = {};

    var msg = _.values(args);
    msg.shift();
    obj.message = msg.join(" ");

    _.assign(obj, {
        level: level,
        meta: presense.meta
    });

    logzio.log(obj);
    logse.log(level,obj.message,obj);
  }

  //Finish log call
  winston.Logger.prototype.log.apply(this,args); 
}

// Meta Data
var company = "budget-text";
var host_name = "eric-base";
var app = 'presense';
var service_name = process.argv[2].split(".")[0];
var service_ext = process.argv[2].split(".")[1];

var meta = {
  company: company,
  host_name: host_name,
  app: app,
  service_name: service_name
}

// Service Parameters
var ping_time = 10000;
var fail_prob = 25;
var startup_time=3000;
var restart_time=3000;

// Internal flags
var please_dont_kill_me=false;    // sets to true after service is attempting to mount
var startup = true;
var service = null;
var updateRef = null;
var service_key = null;

// Presense data
var presense = {
  message: "I'm Here!!",
  meta: meta
};

//Logger
var prefix = "[ "+[company,service_name].join(" ][ ") +" ]";
logger.info("Attempting to start",service_name);

//Company firebase systems
var companyRef = new Firebase("https://presense.firebaseio.com/"+company);
var serviceRef = companyRef.child("services").child(service_name);

//Create toolkit
var tools = {
  startup: startup,
  starting: starting,
  prefix: prefix,
  logger: logger,
  config: {
    startup_time: startup_time
  }
}

module.exports = {
  attemptToMount: attemptToMount
}

// Register Service
attemptToMount();
function attemptToMount(){

  serviceRef.child("mount").once("value",function(snap){
    var key = snap.key();
    var val = snap.val();

     if(val == null){
      //No hosts, mount
      please_dont_kill_me=true;
      if(updateRef){
        updateRef.set(null);
      }
      logger.info("No service detected, Mount");    

      // Inject Service
      service = require("./"+service_name+".js");      

      // Load Service Data
      presense.meta.service_name = service_name+":"+service.meta.version;
      if(_.has(service,'config.startup_time')){
        tools.config.startup_time = service.config.startup_time
      }
      else{
        tools.config.startup_time = 10000;
      } 

      // Mount Service
      service.mount(tools);

    }
    else{
      //check every interval and mount if empty
      if(!updateRef){
        updateRef = serviceRef.child("queue").push(host_name);
        service_key = updateRef.key();
        presense.service_key = service_key;
        updateRef.onDisconnect().remove();
        kill_me_if();
      }
      else {
        updateRef.set(host_name);
      }

      logger.debug("Service detected, Wait to Mount, ",service_key);
      setTimeout(attemptToMount,ping_time);

    }

  })
}


process.on('uncaughtException', function(err) {
  logger.error("'Uncaught exception: '",err.toString());
  if(chance.bool({likelihood: fail_prob})){
    process.exit();
  }
  else{
    setTimeout(attemptToMount(),restart_time);
  }
  
});

process.on('unhandledRejection', function(reason, p) {  
  logger.error("Unhandled Rejection at: Promise ", p, " reason: ", reason);   
  if(chance.bool({likelihood: fail_prob})){
    process.exit();
  }
  else{
    setTimeout(attemptToMount(),restart_time);
  }
});

function startTimer(){
  setTimeout(function(){
    logger.info("Startup over after",tools.config.startup_time,"ms.");
    tools.startup=false;
    presense.startup=false;
    serviceRef.child("mount").update(presense);
    check_host_key();
  },tools.config.startup_time);
}

function starting(){
  logger.info("Inside the service.");
  
  if(!presense.service_key){
     presense.service_key = chance.name({ prefix: true });
  }
  presense.startup = startup;

  //Remove if disconnected
  serviceRef.child("mount").onDisconnect().remove();
  serviceRef.child("mount").set(presense,function(err){
    if(err){
      logger.error("Error Mounting, I lost the race.",err);
      serviceRef.child("mount").onDisconnect().cancel();
      process.exit();
    }
  });

  serviceRef.child("mount").on("child_removed",function(){
    logger.info("Notification to terminate");
    logger.info("Kill signal... why have you forsaken me . . .");
    process.exit();
  });

  startTimer();

  ping();
}

function ping(){
  setInterval(function(){
    logger.debug("Tick");
    serviceRef.child("mount").update({"message": "I'm Heree!!", "time":moment().format()});
    check_host_key();
  },ping_time);
}


function check_host_key(){
  serviceRef.child("mount").once("value",function(snap){
    var val = snap.val();
    var key = val.service_key;

    if(key != presense.service_key){
      logger.info(prefix,"Presense misallocated resources.  Please shut down.");
      serviceRef.child("mount").onDisconnect().cancel();
      process.exit();
    }
    else{
      logger.debug(prefix,"You are a surviver.",presense.service_key);
    }

  });
}


function kill_me_if(){
  serviceRef.child("queue").orderByKey().equalTo(service_key).on("child_removed",function(){
    logger.info("q Notification to terminate, abort if choosen one");
    if(!please_dont_kill_me){
      logger.info("q Kill signal... why have you forsaken me . . .");
      process.exit();
    }
  });
}
