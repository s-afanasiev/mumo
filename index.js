	"use strict";
	
	//MODULES
	const m_mumo = require("./mumo.js");
	const EventEmitter 	= require('events').EventEmitter;
	//CONSTANTS
	const IP	= "192.168.0.110";
	const ID	= "S45000";
	const PORT	= 3234;
	
	
	/************************
	*** Entry point
	************************/
	function init()
	{
		let prm_max_manager_srv = m_mumo.connect(IP,PORT);
		
		prm_max_manager_srv.then((manager_interface) =>
		{
            //Связь с Менеджером потеряна
			manager_interface.on("mgr_lost",(msg) => {
				console.log("link with manager was lost, details:",msg);
			});
			//Широковещательные события
			manager_interface.on("broadcast",(obj) => {
                console.log("<--->Broadcast<---> " + obj.type + ". Msg = " + obj.msg + ". Fields = " + obj.fields);
			});	

            try_exec_cmd(["15",IP,PORT,"get mgrinfo"]);
            try_exec_cmd(["16",IP,PORT,"get srvlist"]);
            try_exec_cmd(["17",IP,PORT,"get joblist"]);
            
		}).catch((e) =>{
			console.log("-=-=-=-=-=-=-"+e.toString());
		});
        
	}

    function try_exec_cmd(cmdArr)
    {
        let prm = new m_mumo.send_command().send(cmdArr);
        if (prm == -1) console.log("Command Fail!");
        else prm.then(res =>
        {
            switch (res.type) {
                case "error":
                    //console.log("--->Error!",res.answer);
                    break;
                /* The simplest one line answer, for example "no Jobs to list" if there was no Jobs When you asked 'get joblist'*/
                case "simple":
                    //console.log("--->Simple!",res.answer);
                    break;
                /* XML converted to JS complex structure*/
                case "xml2js":
                    //console.log("--->xml2js!",JSON.stringify(res.answer));
                    break;
                default:
                    break;
            }
        }).catch(e => {
             console.log("-=ERROR=-"+e.answer);
        });
    }
	
	init();


