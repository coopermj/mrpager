/*function loadXMLDoc() {
	var xmlhttp;
	xmlhttp=new XMLHttpRequest();
	xmlhttp.open("GET","/waitlist",false);
	xmlhttp.send();
	if (xmlhttp.readyState==4 && xmlhttp.status==200) {
		document.getElementById("listOfPagees").innerHTML=xmlhttp.responseText;
	}

	xmlhttp2=new XMLHttpRequest();
	xmlhttp2.open("GET","/pagedlist",false);
	xmlhttp2.send();
	document.getElementById("listOfInvited").innerHTML=xmlhttp2.responseText;	
	
}*/

function loadXMLDoc(url, cfunc)
{
	return;
	if (window.XMLHttpRequest)
	  {// code for IE7+, Firefox, Chrome, Opera, Safari
	  	xmlhttp=new XMLHttpRequest();
	  }
	else
	  {// code for IE6, IE5
	  	xmlhttp=new ActiveXObject("Microsoft.XMLHTTP");
	  }
	xmlhttp.onreadystatechange=cfunc;
	xmlhttp.open("GET",url,true);
	xmlhttp.send();
}


function pageStarter() {
	if (window.XMLHttpRequest)
	  {// code for IE7+, Firefox, Chrome, Opera, Safari
	  	xmlhttp=new XMLHttpRequest();
	  	xmlhttp2 = new XMLHttpRequest();
	  }
	else
	  {// code for IE6, IE5
	  	xmlhttp=new ActiveXObject("Microsoft.XMLHTTP");
	  	xmlhttp2=new ActiveXObject("Microsoft.XMLHTTP");
	  }

	  xmlhttp.open("GET","/waitlist",true);
	  xmlhttp.send();
	  xmlhttp.onreadystatechange = function() {
	  	if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
			document.getElementById("listOfPagees").innerHTML=xmlhttp.responseText;
		}
	  }


	  xmlhttp2.open("GET","/pagedlist",true);
	  xmlhttp2.send();
	  xmlhttp2.onreadystatechange = function() {
	  	if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
			document.getElementById("listOfInvited").innerHTML=xmlhttp2.responseText;
		}
	  }
}

function doPage(id) {
	console.log('do page: ' + id);
	document.getElementById(id).disabled=true;
	document.getElementById(id).value='Paging...';
	var xmlhttp = new XMLHttpRequest();
	var xmlhttp2 = new XMLHttpRequest();
	xmlhttp2.open('GET', '/dopage' + id);
	xmlhttp2.send();
	xmlhttp2.onreadystatechange = function() {
	  	if (xmlhttp2.readyState == 4 && xmlhttp2.status == 200) {
			document.getElementById("listOfInvited").innerHTML=xmlhttp2.responseText;
			document.getElementById(id).disabled=false;

			// after we know it posted, update the top list
			xmlhttp.open("GET","/waitlist",true);
			xmlhttp.send();
			xmlhttp.onreadystatechange = function() {
				if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
					document.getElementById("listOfPagees").innerHTML=xmlhttp.responseText;
				}
			}	
		}
	  }
}

function doArrived(id) {
	//document.getElementById(id).disabled=true;
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.open('GET', '/doarrived' + id);
	xmlhttp.send();
	xmlhttp.onreadystatechange = function () {
		if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
			document.getElementById("listOfInvited").innerHTML=xmlhttp.responseText;			
		}
	}
}

function doRemove(id) {
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.open('GET', '/doremove' + id);
	xmlhttp.send();
	xmlhttp.onreadystatechange = function() {
		pageStarter();
	}
}

function validatePhone(fld) {
    var error = "";
    var stripped = fld.value.replace(/[\(\)\.\-\ ]/g, '');     

   if (fld.value == "") {
        error = "You didn't enter a phone number.\n";
        fld.style.background = 'Yellow';
    } else if (isNaN(parseInt(stripped))) {
        error = "The phone number contains illegal characters.\n";
        fld.style.background = 'Yellow';
    } else if (!(stripped.length == 10)) {
        error = "The phone number is the wrong length. Make sure you included an area code.\n";
        fld.style.background = 'Yellow';
    } 
    return error;
}


function submitEntry() {
	var userName = encodeURIComponent(document.getElementsByName('userName')[0].value);
	var complaint = encodeURIComponent(document.getElementsByName('complaint')[0].value);

	// validate the phone number, then strip everything to numbers
	var valError = validatePhone(document.getElementsByName('phoneNo')[0]);
	if (valError != '') {
		alert(valError);
	} 
	else {
		var stripped = document.getElementsByName('phoneNo')[0].value.replace(/\D/g,"");
		var phoneNo = encodeURIComponent(stripped);
		var parameters = 'userName='+userName+'&phoneNo='+phoneNo+'&complaint='+complaint;

		var xmlhttp = new XMLHttpRequest();

		xmlhttp.onreadystatechange = function() {
			if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
				document.getElementById("listOfPagees").innerHTML=xmlhttp.responseText;
			}
		}

		xmlhttp.open("POST", "/submitNew", true);
		xmlhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
		xmlhttp.send(parameters);

	}

}