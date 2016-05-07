var plivo = require('plivo');
var Firebase = require("firebase");
var winston = require("winston");

var btxt= require('./node_modules/budget-text/budget_text.js');





var p = plivo.RestAPI({
  authId: 'MAYZK0YMM3MTA2ZTIZOG',
  authToken: 'ZWM5ZGM0NzA1MzMwMGZhYTgwMmIzMjMyNDIyYTQx'
});
var accountsRef = new Firebase("https://budgettext.firebaseio.com/_accountsRaw/");
var numbersRef = new Firebase("https://budgettext.firebaseio.com/_numbers/");
var userNumbersRef = new Firebase("https://budgettext.firebaseio.com/Numbers/");
var phoneRef = new Firebase("https://budgettext.firebaseio.com/_phone/");
var applicationsRef = new Firebase("https://budgettext.firebaseio.com/_applications/");


module.exports = {
  mount: mount
}

var config = {
  "service_name": "plivo_fire",
  "version": "0.1.1"
}
module.exports.config = config;

var logger;
var prefix;


function getArrayBy(ref,child,value){

	var promise = new Promise(function(resolve,reject){
	  ref.orderByChild(child).equalTo(value).once("value", function(snapshot) {
	    if(snapshot.val() == null){
	      reject("error");
	    }
	    else{
	      var ky = Object.keys(snapshot.val())[0]
	      var obj = snapshot.val()[ky];

	      resolve( obj, ky );
	    }
	  });
  	});

	return promise;
}

//loadPlivo();

function loadPlivo(){
  //loadPlivoSubAccounts();
  loadPlivoNumbers();
  loadPlivoApplications();
}


function mount(tools){
  logger = tools.logger;
  prefix = tools.prefix;

  // Test tool transfer
  logger.info("Testing logger.");

  // Tell presense I'm starting
  tools.starting();



  numbersRef.on('child_added', function(childSnapshot, prevChildKey) {
    // code to handle new child.
    var value = childSnapshot.val();
    var key = childSnapshot.key();
    logger.info("Copy bTXT number (",value.number,") to _phone");
    


    var phone = {
      "ID": childSnapshot.key(),
      "plivo": value,
      "bTXT": true
    }

    phoneRef.child(value.number).update(phone);


    if(value.owner=="BudgetText"){
      //Copy to BudgetText User
      userNumbersRef.child(value.owner).child(key).update(value);
    }
    else{
      //Copy to specific user
      userNumbersRef.child(value.owner).child(key).update(value);

    }
  });


  numbersRef.on('child_removed', function(childSnapshot, prevChildKey) {
    // code to handle new child.
    var value = childSnapshot.val();
    logger.info("Remove bTXT number (",value.number,") - UNRENT from plivo");


    btxt.sms.remove_number(value.number);
    
  });


  userNumbersRef.on('child_added', function(childSnapshot, prevChildKey) {
    // code to handle new child.
    var uid = childSnapshot.key();
    var value = childSnapshot.val();
    
    logger.info("User Number : Watching UID :",uid);

    var numbers = userNumbersRef.child(uid);

    numbers.on("child_removed", function(snap){
      var key = snap.key();
      var val = snap.val();
      logger.info("User Number : Remove :",key);
      numbersRef.child(key).set(null);
      phoneRef.child(val.number).set(null);
    });
     
  });
}

function loadPlivoNumbers(){
  logger.info("Load Plivo Numbers");
    // Get details of all numbers
    var params = { 
      'limit' : '10',
      'offset' : '0'
    };

    p.get_numbers(params, function (status, response) {
      if(status == 200){
        logger.info("Load Plivo Numbers: Loading",response.meta.total_count,"numbers.");
 
        response.objects.forEach(function(object){
        	getArrayBy(numbersRef,"resource_uri",object.resource_uri).then(function(obj,id){
    		    //success, update current info
	            numbersRef.child(id).update(objet);
      		},function(err){
          		//failure, add to numbers ref
	            numbersRef.push(object);
    		});
        });
      }
      else{
       logger.info("Load Plivo Numbers, Status", status);
       logger.info("Load Plivo Numbers, API responsse\n", response);
      }
        
    });   
}

function loadPlivoApplications(){
  console.log("[ bTXT ] Load Plivo Applications");
  // Filtering the records
  var params = {
    'limit': '10', // The number of results per page
    'offset': '0', // The number of items by which the results should be offset
  };

  p.get_applications(params, function (status, response) {
    if(status == 200){
      logger.info("Load Plivo Applications: Loading",response.meta.total_count,"applications.");  
     response.objects.forEach(function(object){
  		getArrayBy(applicationsRef,"resource_uri",object.resource_uri).then(function(obj,id){
		    //success, update current info
            applicationsRef.child(id).update(object);
  		},function(err){
      		//failure, add to numbers ref
            applicationsRef.push(object);
		});       
      });
    }
    else{
     logger.info("Load Plivo Applications, Status", status);
     logger.info("Load Plivo Applications, API responsse\n", response);
   } 
 
  });
}
