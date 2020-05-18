"use strict";



const net = require("net");
const fs = require("fs");
const dgram = require('dgram');
const convert = require('xml-js');

const EventEmitter = require('events').EventEmitter;

/*--------------------------------*/
/*------DON'T TOUCH THIS---------*/
/*--------------------------------*/
//const STATUSES = ["come","bad",send","wait","done","wrong"];
const COME = 0;
const SEND = 1;
const WAIT = 2;
const DONE = 3;
const BAD = 4;
const WRONG = 5;
const MISSED = 6;
// Константы для структуры Command и Manager
//Обязательно ID=0
const ID = 0;
const HOST = 1;
const TCPPORT = 2;
//Обязательные 0,1,2,3
// Константы для структуры Command
const CMD = 3;
const SIMPLY = 4;
const ANSWER = 5;
const LONG = 6;
const STATE = 7;
const TRIAL = 8;
// Константы для структуры Manager
const UID = 0;
const FREE = 4;
const CONTEXT = 5;
const TCPSOCK = 6;
const UDPPORT = 7;
const UDPSOCK = 8;
const CARR = 9;
const ERR_CMD = 10;
const JOBS = 11;
    const JOBNUM = 0;
    const TASKS = 1;
    const PRCNT = 2;
    const FRAME = 3;
const TCP_RECONN_NEED = 12;
const TCP_TRY = 13;
// on/off by 'read_console()'
const CONS_TCP_MUST = 14;
const IN_CMD_PRM = 15;
const IN_CMD_EMIT = 16;
const IN_JI_PRM = 17;
const IN_JI_EMIT = 18;

const EXT_CONN_PRM = 19;
const EXT_CONN_EMIT = 20;
const SAFR_USING = 21;
const EXT_KITS = 22;
const LOGIC_CONN = 23;
/*---------------------------------*/
/*--------------------------------*/
/*--------------------------------*/

// Global structures and variables
let book = [];
let udp_global = 30001;
var kit_counter = 0;
let console_on = false;
var comments = false;
const CMD_DICTIONARY = {
    "get jobstate (numb)": "Display Job State. Possible Answers: 'Complete', 'Not started', 'Active', 'Suspended', 'Waiting'",
    "get joblist": "Get Job List in 'XML-2-JS' converted format",
    "get jobinfo (numb)": "Get Info about Job with number (numb) in XML-2-JS",
    "get job (numb)": "Get Max Detailed Info about Job with number(numb). This command is an extended (more complete) verion of the command 'get jobinfo' (XML-JS)",
    "get server (mac)": "Get Info about Server with ID (mac) in XML-2-JS format. Annotation: Servers are identified by the MAC address of the physical machine on which they are located",
    "get srvlist": "Get Servers List (XML-JS)",
    "get srvgroups": "Information about Servers Groups. Answer can be 'simple' type like 'No Groups to List', or 'xml2js' kind",
    "get clientlist": "Get a list of all clients of the current Manager(XML-JS). In fact, the command is useless because the client is only one NODE.",
    "get mgrinfo (id)": "Get Manager information, where (id) == '<ip>_<port>'. (XML-JS)",
    "get jobsrverrorlst (numb)": "Request info about errors After suitable notify: event '15' or '1b' means cancelled or aborted Jobs",
    "new controller Yes": "Get control to allow operations. Control Will Granted in 10 sec. Although the commands are processed without this instruction",
    "reset jobs (jobnum) (mac)": "for example: 'reset jobs 717170087 E839DFB5FEEB0000'. Annotation: When Server Was trying to render some Job, but Fail It cause Wrong Path, he Then trying to render It some more times and then still hanging with the error. This command can to get it to run again",
    "suspend job (numb)": "To Suspend job number (numb)",
    "activate job (numb)": "To Activate job number (numb)",
    "del job (numb)": "To Delete job number (numb)",
    "set jobpriority (val)": "Change Job priority, where (val) is a value between 0 and 100",

    "broadcast_msgs_types": ['mgr_off', 'last_frame_update', 'job_render_end', 'job_render_start', 'job_state_change', 'job_deleted', 'new_job_appear', 'job_restarted', 'render_error', 'job_queuing_up', 'frame_update', 'server_off', 'server_on', 'server_free', 'render_aborted', 'server_deleted', 'control_grant'],
    "broadcast_msgs_details": "Any broadcast message always has a next Properties: 'type', which is Explained above; 'ip' and 'port', which identified Manager; and 'fields', which is an Array of Strings of available properties. Basically, we expect events related either to the Server or to the Job and the corresponding properties 'mac' and 'job'. The 'frame_update' type event contains properties: 'frame', 'ms' and 'percent'",
    "future_advanced_options": {
        "create global group": "Create a global server group",
        "get mgr id list": "Something else",
    }
}

/*****IMPLEMENTATION*****/
/*ANNOTATION: Please, Don't Use ID = 'S1' and 'U1'*/
//cmd = [1046, "192.168.0.102", "3234", "get srvlist"];
//mgrProxy(cmd);

function mumo_callback(id, data,m) {
    //broadcast message with ID == null. Null casted to Number type becomes 0
    if ((Number(id) === 0) || (typeof id == 'undefined')) {
        //'data.fields' property displays available object fields
        //if(comments) console.log("<<<>>>Broadcast<<<>>> Type = " + data.type + ". Msg = " + data.msg + ". Fields = " + data.fields);
        if (typeof m != 'undefined') {
           try{
               book[m][EXT_CONN_EMIT].emit('broadcast', data);
           } catch(e){}
        }
    }
    //Answer to Request with ID:
    else {
        switch (data.type) {
            /* ERROR MEANS that Command (with ID) Not Executed by 2 reasons: 1) no tcp link 2) self App don't understand socket answers, in other words, can not adequately respond to the command. Then App try to run the command again every 5 sec. At the same time, within about 30 seconds it becomes possible to establish explicitly reason. We can uniquely determine the cause of failure: or the connection is lost, or the application is unable to process command. In the first case, we try to reconnect Manager. In the second - send Pardon to callback and Delete Cmd with a promise to fix the behavior in the new version*/
            case "error":
                //if (comments) console.log("=====>This is Error Answer");
                //if (comments) console.log("data.answer=" + data.answer);
                break;
                // The simplest one line answer, for example "no Jobs to list" if there was no Jobs When you asked 'get joblist'
            case "simple":
                //if(comments) console.log("=====>This is Simple String Answer");
                //if(comments) console.log(data.answer);
                break;
                // XML converted to JS complex structure
            case "xml2js":
                //if(comments) console.log("=====>This is xml2js-converted structure");
                //if(comments) console.log(JSON.stringify(data.answer));
                break;
        }
    }
}

/*****MAIN FUNCTIONS*****/

function mgrProxy(cmdRow,ext_kit) 
{
    cmdRow[SIMPLY] = cmd_simplify(cmdRow[CMD]);
    if (validate_data(cmdRow) == false) {
        let js = {};
        js.type = "error";
        js.fields = ["type", "ip", "port", "answer"];
        js.ip = cmdRow[HOST];
        js.port = cmdRow[TCPPORT];
        js.answer = "Wrong command: " + cmdRow[CMD];
        mumo_callback(cmdRow[ID], js);
        return -1;
    }
    cmdRow[LONG] = false;
    cmdRow[STATE] = COME;
    cmdRow[TRIAL] = 0;
    cmdRow[ANSWER] = "";
    let uniqId = cmdRow[HOST] + "_" + cmdRow[TCPPORT];
    let mt = find_some_in_array(book, UID, uniqId);
    if (mt == -1) {
        //Make record in Book consist of Mgrs which contains CmdArrs
        let oneMgrArr = [];
        oneMgrArr[EXT_KITS] = [];
        if (typeof ext_kit != 'undefined') {      
            oneMgrArr[EXT_KITS].push(ext_kit);
        }
        oneMgrArr[LOGIC_CONN] = false;
        oneMgrArr[UID] = uniqId;
        oneMgrArr[HOST] = cmdRow[HOST];
        oneMgrArr[TCPPORT] = cmdRow[TCPPORT];
        oneMgrArr[FREE] = false;
        oneMgrArr[CONTEXT] = "handshake_need";
        oneMgrArr[SAFR_USING] = false;
        oneMgrArr[CARR] = [];
        oneMgrArr[CARR].push(cmdRow);
        oneMgrArr[JOBS] = [];
        oneMgrArr[TCP_TRY] = false;
        oneMgrArr[CONS_TCP_MUST] = true;
        book.push(oneMgrArr);
        mt = Number(book.length) - 1;
    } 
    else {
        book[mt][CARR].push(cmdRow);
        if (typeof ext_kit != 'undefined') {
            book[mt][EXT_KITS].push(ext_kit);
        }
        
    } 
    //Теперь разгружаем
    reduce_book(mt);
    return mt;
}

function validate_data(cmdRow) {
    if (cmdRow[ID] == "C1") return true;
    if (cmdRow[ID].startsWith("S")) return true;
    let result = false;
    switch (cmdRow[SIMPLY]) {
        case "activate_job":
        case "del_job":
        case "get_clientlist":
        case "get_job":
        case "get_jobinfo":
        case "get_joblist":
        case "get_jobstate":
        case "get_jobsrverrorlst":
        case "get_mgrinfo":
        case "get_server":
        case "get_srvgroups":
        case "get_srvlist":
        case "get_taskmetadata":
        case "new_controller":
        case "reset_jobs":
        case "restart_job":
        case "set_jobpriority":
        case "suspend_job":
            result = true;
            break;
        default:
            result = false;
            break;
    }
    if(comments) console.log("Valid Command?: " + result);
    return result;
}

//!!!SAFRON EDIT
function reduce_book(m) 
{
    if (book[m][CONTEXT] == "handshake_need") {
        book[m][CONTEXT] = "handshake_try";
        book[m][TCPSOCK] = new net.Socket();
        setTcpListeners(book[m][TCPSOCK]);
        book[m][TCPSOCK].connect(book[m][TCPPORT], book[m][HOST], function () {
            //it is necessary to send him just this quickly
            book[m][TCPSOCK].write("new login\r\n");
            book[m][TCP_TRY] = false;
            book[m][TCP_RECONN_NEED] = false;
            book[m][LOGIC_CONN] = true;
            book[m][CONTEXT] = "handshake";
            if(comments) console.log("sending to m#" + m + " -> 'new login'");
            if (!console_on) read_console(m);
            /*setup UDP-listeners*/
            setUdpListeners(m);
        });
        return;
    }
    if (book[m][CONTEXT] == "handshake_try") {
        return;
    }
    if(comments) console.log("253.m#" + m + "'s queue length = ", book[m][CARR].length);
    for (let c in book[m][CARR]) {
        if (book[m][FREE]) {
            book[m][FREE] = false;
            book[m][CARR][c][STATE] = SEND;
            book[m][CONTEXT] = book[m][CARR][c][SIMPLY];
            let startMsg = cmd_translate(book[m][CARR][c][CMD]);
            if(comments) console.log("___SENDING TO SOCKET: "+startMsg);
            book[m][TCPSOCK].write(startMsg);

            //Safron edit
            book[m][IN_CMD_PRM] = new Promise((resolve, reject) => {
                book[m][IN_CMD_EMIT] = new EventEmitter;
                book[m][IN_CMD_EMIT].once('in_cmd_done', on_event_done);
                book[m][IN_CMD_EMIT].once('in_cmd_err', on_event_err);
                
                function on_event_done(obj) { resolve(obj); }
                function on_event_err(obj) { reject(obj); }
                setTimeout(() => {
                    book[m][IN_CMD_EMIT].removeAllListeners('in_cmd_done'); 
                    reject(new Error(c));
                }, 5000);
            });

            book[m][IN_CMD_PRM].then(
                res => {
                    if(comments) console.log("IN_CMD_PRM Fullfilled! ");
                    let evem = book[m][EXT_KITS][0].emitter;
                    evem.emit("ext_cmd_done",res);
                    book[m][EXT_KITS].splice(0,1);
                },
                error => {
                    if(comments) console.log("Rejected: cmd#" + error.message);
                    book[m][EXT_KITS][0].emitter.emit("ext_cmd_err",error);
                    book[m][EXT_KITS].splice(0,1);
                    final_answer(m, error.message, "error");
                }
            );
            break;
        }
    }
}

function cmd_simplify(cmd) {
    let tmp = "";
    let arr = cmd.split(" ");
    if (arr.length > 1) {
        tmp = arr[0] + "_" + arr[1];
        return tmp;
    } else return cmd;
}

function cmd_translate(cmd) 
{
    let result;
    if (cmd == "get joblist") result = "get jobhlist\r\n";
    else if (cmd.indexOf("reset jobs") > -1) {
        let arr = cmd.split(" ");
        result = "del jobserver " + arr[2] + " " + arr[3] + "\r\n";
    } 
    else if (cmd.indexOf("suspend job") > -1) {
        let arr = cmd.split(" ");
        result = "set jobstate " + arr[2] + " 1\r\n";
    } 
    else if (cmd.indexOf("activate job") > -1) {
        let arr = cmd.split(" ");
        result = "set jobstate " + arr[2] + " 0\r\n";
    } else result = cmd + "\r\n";

    return result;
}


//!!!SAFRON EDIT
function setTcpListeners(tcpSock) 
{
    if(comments) console.log("'setTcpListeners()'");
    tcpSock.on("data", function (data) {
        //let thisId = this.remoteAddress + "_" + this.remotePort;
        let mt = find_some_in_array(book, TCPSOCK, this);
        let ct = 0;
        if (mt == -1) {
            if(comments) console.log("VERY BAD! Got Data from TCP, but No info about this Manager!");
            return;
        } 
        if (book[mt][CONTEXT] == "handshake") {
            handshake(data, mt,ct);
            return;
        }
        // in the case of the Cmd 'reset jobs'
        if (typeof book[mt][CARR][ct] == 'undefined') {
            if(comments) console.log("in 'tcp_listener()' Cmd#0 of Mgr#" + mt + " is not Exist. We allowed ourselves to do this in the case of the Cmd 'reset jobs'. ");
            return;
        }
        if (book[mt][CARR][ct][SIMPLY] == book[mt][CONTEXT]) {
            received_tcp_distributor(data, mt, ct);
        } 
        else {
            if(comments) console.log("VERY BAD! First queue cmd don't maches with Context");
        }
    });
    tcpSock.on("error", function (err) {
        let targ = find_in_sockets(TCPSOCK, this);
        if(comments) console.log("catch ERROR from:", book[targ][UID], ". DETAILS:", err.message);
        
        ///* for safron *///
        if (book[targ][CONTEXT].startsWith("safr_connect")){
            book[targ][EXT_CONN_EMIT].emit('in_conn_fail', err);
            return;
        }
        if (book[targ][SAFR_USING]) {
            book[targ][SAFR_USING] = false;
            try {
                /*Отсутствие приставки in в начале имени события подразумевает отправку события наружу модуля*/
                book[targ][EXT_CONN_EMIT].emit('mgr_lost', err);
            } catch(e){if(comments) console.log("fail by EXT_CONN_EMIT",e);}
            return;
        }
        
        if (book[targ][CONS_TCP_MUST]) {
            try_reconnect();
            return;
        } 
        else {
            let js = {};
            js.type = "error";
            js.fields = ["type", "msg"];
            js.msg = "Command not executed, cause no connection with Mgr " + book[targ][UID];
            if (targ > -1) {
                js.ip = err.address;
                js.port = err.port;
                if (book[targ][CONS_TCP_MUST])
                    book[targ][TCP_RECONN_NEED] = true;
                else book[targ][TCP_RECONN_NEED] = false;

                book[targ][TCP_TRY] = false;
                //clearCmdJournal(em, "Mgr is Offline");

                if (typeof book[targ][ERR_CMD] != 'undefined') {
                    try {
                        mumo_callback(book[targ][ERR_CMD][ID], js);
                    }catch (e) {}
                }
                
                try_reconnect(targ);
            }
        }
    });
    tcpSock.on("end", function () {
        if(comments) console.log("on TCP Socket 'END' Event. Remote host send FIN packet.");
    });
    tcpSock.on("close", function (has_error) {
        if (has_error) if(comments) console.log("on TCP Socket 'Close' Event with Error!");
        else if(comments) console.log("on TCP Socket 'Close' Event!");
    });
}

function setUdpListeners(m) 
{
    udp_global = udp_global - 1;
    book[m][UDPPORT] = udp_global;
    book[m][UDPSOCK] = dgram.createSocket('udp4');
    book[m][UDPSOCK].on('error', (err) => {
        if(comments) console.log(`udpSock error:\n${err.stack}`);
        book[m][UDPSOCK].close();
        if (err.code == "EADDRINUSE") {
            if(comments) console.log("truying another UDP port: " + (udp_global - 1));
            setUdpListeners(m);
        }
    });
    book[m][UDPSOCK].on('message', (msg, rinfo) => {
        udp_parser(msg, rinfo, m);
    });
    book[m][UDPSOCK].on('listening', () => {
        let address = book[m][UDPSOCK].address();
        if(comments) console.log(`udpSock listening ${address.address}:${address.port}`);
        //            reTranslateUdpSocket(book[m][UDPSOCK]);
    });
    book[m][UDPSOCK].bind(book[m][UDPPORT]);
}

function received_tcp_distributor(data, mt, ct) 
{
    switch (book[mt][CONTEXT]) {
        case "get_jobstate":
            get_jobstate(data, mt, ct);
            break;
        case "get_joblist":
        case "get_jobinfo":
        case "get_job":
            //        case "get_taskmetadata":
            //        case "get_taskname":
            get_job(data, mt, ct);
            break;
        case "get_server":
        case "get_srvlist":
        case "get_srvgroups":
            get_srvlist(data, mt, ct);
            break;
        case "get_clientlist":
        case "get_mgrinfo":
        case "get_jobsrverrorlst":
            try_catch_xml(data, mt, ct);
            break;
        case "new_controller":
            new_controller(data, mt, ct);
            break;
        case "reset_jobs":
            reset_jobs(data, mt, ct);
            break;
        default:
            if(comments) console.log("UNEXPECTED CONTEXT = ", book[mt][CONTEXT]);
            let sub = data.slice(0, 14).toString();
            if ((sub.indexOf("400 Unknown") > -1) || (sub.indexOf("200 OK") > -1)) {
                book[mt][CARR][ct][ANSWER] = data.toString();
                final_answer(mt, ct, "simple");
            }
            break;
    }
}

function final_answer(m, cmd, kind) 
{
    let js = {};
    js.type = kind;
    js.ip = book[m][HOST];
    js.port = book[m][TCPPORT];
    let c;
    //the most healthy behavior
    if (typeof cmd != 'undefined')  c = cmd;
    // check for NULL
    else if (((cmd != 0) || (cmd != "0")) && (Number(cmd) === 0)) {
        c = Number(cmd);
    } 
    // this is universal case to set value = 0
    else c = 0;

    switch (kind) {
        case "xml2js":
            js.answer = convert_xml_js(m, c);
            if (book[m][CONTEXT] == "get_joblist")
                copy_jobs_from_joblist(m, c, js);
            if (book[m][CONTEXT] == "get_jobinfo")
                copy_tasks_jobinfo(m, c, js);
            if (book[m][CONTEXT] == "get_jobsrverrorlst")
                render_errors_notify(m, c, js);
            book[m][CARR][c][STATE] = DONE;
            book[m][IN_CMD_EMIT].emit('in_cmd_done',js);
            // If it not from UDP-coupled, then send answer
            if (book[m][CARR][c][ID] != "U1") {
                mumo_callback(book[m][CARR][c][ID], js,m);
            }
            take_from_queue(m, c);
            break;
        case "simple":
            js.answer = book[m][CARR][c][ANSWER];
            book[m][CARR][c][STATE] = DONE;
            mumo_callback(book[m][CARR][c][ID], js,m);
            take_from_queue(m, c);
            break;
        case "error":
            if (book[m][TCPSOCK].destroyed) {
                book[m][ERR_CMD] = c;
                js.answer = "TCP Link with Mgr " + book[m][UID] + " Was Lost, Trying To Reconnect";
                mumo_callback(book[m][CARR][c][ID], js);
                book[m][IN_CMD_EMIT].emit('in_cmd_err',js);
                try_reconnect();
                return;
            }

            if (book[m][CARR][c][TRIAL] == 2) {
                js.answer = "sorry, Self App don't understand what's going on and Delete This Command. Will Repair in Future Versions";
                mumo_callback(book[m][CARR][c][ID], js);
                book[m][CARR][c][STATE] = MISSED;
                take_from_queue(m, c);
            } else {
                js.answer = "sorry, command not executed at moment! There are 2 reasons: 1)Manager Link Lost 2) Self App can't process command. Try to repeat, try " + book[m][CARR][c][TRIAL];
                book[m][CARR][c][TRIAL]++;
                mumo_callback(book[m][CARR][c][ID], js);
                book[m][FREE] = true;
                reduce_book(m);
            }
            break;
        default:
            break;
    }
}

function take_from_queue(m, c) 
{
    for (let i=0; i<book[m][CARR].length; i++) {
        if(comments) console.log("TAKE_FROM_QUEUE(): cmd="+book[m][CARR][i][CMD]+", id="+book[m][CARR][i][ID]);
    }
    
    let f_safr_id = book[m][CARR][c][ID].toString().startsWith("S");
    let f_safr_conn = book[m][CARR][c][CMD] == "safr_conn mgr";
    let f_done = book[m][CARR][c][STATE] == DONE;
    let f_missed = book[m][CARR][c][STATE] == MISSED;
    let f_hs = book[m][CONTEXT] == "handshake";
    
    if ((book[m][CARR].length == 0) && (!f_hs)) {
        book[m][FREE] = true;
        book[m][CONTEXT] = "";    
        return;
    }
    if (f_hs) {
        if (f_safr_conn) {
            book[m][CARR].splice(c, 1);
        }
        book[m][FREE] = true;
        book[m][CONTEXT] = "";
        reduce_book(m); 
    }
    else if (f_done || f_missed || f_safr_id) {
        book[m][CARR].splice(c, 1);    
        book[m][FREE] = true;
        book[m][CONTEXT] = "";
        reduce_book(m); 
    }
    else {
        if(comments) console.log("BAD! Command Not processed properly. Not assigned state DONE or MISSED");
    }
}

function try_reconnect(m) 
{
    if(comments) console.log("----------try_reconnect()-----------");
    for (let m in book) {
        if ((book[m][TCP_RECONN_NEED]) || (book[m][TCPSOCK].destroyed)) {
            if(comments) console.log("[" + m + "][TCP_RECONN_NEED]=" + book[m][TCP_RECONN_NEED] + ", [" + m + "]socket.destr=" + book[m][TCPSOCK].destroyed);

            //'reconnect' function use this Flag forself
            if (book[m][TCP_TRY] == false) {
                try {
                    book[m][UDPSOCK].close(function () {
                        if(comments) console.log("UDP Socket of m#" + m + " Was Closed!");
                    });
                } catch (e) {
                    if(comments) console.log("Fail to close UDP-port:",e);
                }

                book[m][TCP_TRY] = true;

                setTimeout(function () {
                    book[m][CONTEXT] = "handshake_need";
                    if(comments) console.log("in 'try_reconnect()' After 10 sec calling reduce() with M#" + m);
                    reduce_book(m);
                }, 10000);
            }
        }
    }
}

function read_console(m) 
{
    console_on = true;
    process.stdin.setEncoding('utf8');
    process.stdin.on('readable', () => {
        let chunk;
        // Use a loop to make sure we read all available data.
        while ((chunk = process.stdin.read()) !== null) {
            if (chunk == "get len\r\n") {
                for (let i in book) {
                    if(comments) console.log("len[" + i + "]=" + book[i][CARR].length);
                }
            } 
            else if (chunk == "stop\r\n") {
                for (let i in book) {
                    book[i][CONS_TCP_MUST] = false;
                    if(comments) console.log("CONS_TCP_MUST = false");
                }
            } 
            else if (chunk == "start\r\n") {
                for (let i in book) {
                    book[i][CONS_TCP_MUST] = true;
                    if(comments) console.log("CONS_TCP_MUST = true");
                }
            } 
            else if (chunk == "get all\r\n") {
                for (let i in book) {
                    if(comments) console.log("[" + i + "]:");
                    for (let j in book[i][CARR])
                    if(comments) console.log("cmd[" + j + "]=" + book[i][CARR][j][CMD]);
                }
            } 
            else {
                let cmdRow = [];
                cmdRow[CMD] = chunk.slice(0, -2);
                cmdRow[ID] = "C1";
                cmdRow[HOST] = book[m][HOST];
                cmdRow[TCPPORT] = book[m][TCPPORT];
                mgrProxy(cmdRow);
            }
        }
    });
}

/*****REQUEST FUNCTIONS******/
function handshake(data, m,c) 
{
    //When compare, Buffer cast to String, so condition below is true
    if (data == "200 3.00 Ready\r\n") {
        book[m][TCPSOCK].write("set clientinfo 598\r\n");
        return;
    }
    if (data == "250 Ready\r\n") {
        let xml = fileToBuffer(null, book[m][UDPPORT]);
        //        if(comments) console.log("UDPPORT="+book[m][UDPPORT]);
        book[m][TCPSOCK].write(xml);
        return;
    }
    if (data == "200 OK\r\n") {
        book[m][TCPSOCK].write("new controller Yes\r\n");
    }
    if ((data == "200 Control Pending\r\n") || (data == "201 OK\r\n")) {
        if(comments) console.log("664.handshaked!!!",data.toString());
        try{
            book[m][EXT_CONN_EMIT].emit("in_conn_success", "connection success!");
        }catch(e){}
        take_from_queue(m,c);
        return;
    }
}

function get_job(data, m, c) 
{
    let sub = data.slice(0, 5).toString();
    if ((sub == "450 J") || (sub == "404 J") || (sub == "251 0")) /*No Jobs*/ {
        if(comments) console.log("we are here, because 'sub'=" + sub);
        book[m][CARR][c][ANSWER] = data.toString();
        final_answer(m, c, "simple");
        return;
    }

    try_catch_xml(data, m, c);
}

function get_jobstate(data, m, c) 
{
    let state = data.toString().slice(4, 5);
    switch (state) {
        case "0":
            state = "Complete";
            break;
        case "1":
            state = "Not Started";
            break;
        case "2":
            state = "Active";
            break;
        case "3":
            state = "Suspended";
            break;
        case "4":
            state = "Waiting";
            break;
    }
    book[m][CARR][c][ANSWER] = "Job state is " + state;
    final_answer(m, c, "simple");
}

function get_srvlist(data, m, c) 
{
    let sub = data.slice(0, 10).toString();
    if ((sub.indexOf("251 0") > -1) || (sub.indexOf("404") > -1)) {
        if (sub == "251 0\r\n") {
            book[m][CARR][c][ANSWER] = "No Servers to List";
        } else {
            book[m][CARR][c][ANSWER] = data.toString();
        }
        final_answer(m, c, "simple");
    } else try_catch_xml(data, m, c);
}

function new_controller(data, m, c) 
{
    if (data == "200 Control Pending\r\n") {
        if(comments) console.log("mt#" + m + " Control Pending");
        book[m][CARR][c][ANSWER] = "Control Will Granted in 10 sec";
    }
    if (data == "201 OK\r\n") {
        if(comments) console.log("mt#" + m + " Control Pending");
        book[m][CARR][c][ANSWER] = "Control Granted Now!";
    }
    final_answer(m, c, "simple");
    // if SOmebody press button 'Deny', we can also ask "get controller\r\n". It means that we ask: 'who controller now?'.THen Mgr answer "251 <some 3 digits>", and then XML <ClientInfo> 

}

function try_catch_xml(data, m, c) 
{
    if (book[m][CARR][c][LONG]) {
        if(comments) console.log("XML IS LONG");
        let sub = data.toString().substr(-10, 10);
        if(comments) console.log("in long XML tail = " + sub);
        if ((sub.indexOf("List>") > -1) || (sub.indexOf("/Job>") > -1) || (sub.indexOf("Info>") > -1) || (sub.indexOf("Server>") > -1)) {
            book[m][CARR][c][ANSWER] += data.toString().slice(0, -2);
            final_answer(m, c, "xml2js");
            return;
        } else {
            book[m][CARR][c][ANSWER] += data.toString();
            return;
        }
    }

    let sub = data.slice(0, 20).toString();
    let index = sub.indexOf("<?xml");
    if (index > -1) {
        //in case the data from the socket is glued together
        book[m][CARR][c][ANSWER] = data.slice(index).toString();
        sub = data.toString().substr(-10, 10);
        if(comments) console.log("in XML tail = " + sub);
        if ((sub.indexOf("List>") > -1) || (sub.indexOf("/Job>") > -1) || (sub.indexOf("Info>") > -1) || (sub.indexOf("Server>") > -1)) {
            book[m][CARR][c][ANSWER] = book[m][CARR][c][ANSWER].slice(0, -2);
            final_answer(m, c, "xml2js");
            return;
        } else {
            book[m][CARR][c][LONG] = true;
        }
    }
}

function convert_xml_js(m, c) 
{
    //    result = convert.xml2js(xml, options);    // to convert xml text to javascript object
    //    result = convert.xml2json(xml, options);  // to convert xml text to json text
    var options = {
        compact: true,
        ignoreComment: true,
        ignoreAttributes: true,
        ignoreDeclaration: true,
        trim: true,
        ignoreInstruction: true
    };

    let xml = book[m][CARR][c][ANSWER];
    let result = convert.xml2js(xml, options);
    //    let name = book[m][CARR][c][SIMPLY];
    //    fs.writeFileSync("Answer_Xml-js_"+name+".txt", result);
    return result;
}

function reset_jobs(data, m, c) 
{
    if (data == "200 OK\r\n") {
        let arr = book[m][CARR][c][CMD].split(" ");
        book[m][TCPSOCK].write("new jobserver " + arr[2] + " " + arr[3] + "\r\n");
        book[m][CONTEXT] = "";
        book[m][CARR][c][STATE] = DONE;
        take_from_queue(m, c);
        return;
    }
}


//-------copy functions---------
function copy_tasks_jobinfo(m, c, js) {
    let jobnum = js.answer.Job.JobInfo.JobHandle._text;
    let tasks = js.answer.Job.JobInfo.NumberTasks._text;
    //Common function which finding requested position in some array
    let pos = find_some_in_array(book[m][JOBS], JOBNUM, jobnum);
    if (pos > -1) {
        book[m][JOBS][pos][TASKS] = tasks;
    } else {
        let jobar = [];
        jobar[JOBNUM] = jobnum;
        jobar[TASKS] = tasks;
        book[m][JOBS].push(jobar);
    }
    if(comments) console.log("in 'copy_tasks()' pos = " + pos);
}

function copy_jobs_from_joblist(m, c, js) {
    let arr = js.answer.JobhList.Job;
    if (typeof arr != 'undefined') {
        book[m][JOBS] = [];
        for (let i in arr) {
            let num = arr[i].Handle._text
            if(comments) console.log("j#" + i + ": " + num);
            book[m][JOBS][i] = [];
            book[m][JOBS][i][JOBNUM] = num;
        }
    } else {
        if(comments) console.log("Sorry! Fail to copy Jobs from Joblist by Incredible Reason!");
    }
}

function render_errors_notify(m, c, js) {
    //    if(comments) console.log("JSON.Stringify = "+JSON.Stringify(js));
    //
    try {
        book[m][IN_JI_EMIT].emit('done', js.answer);
    } 
    catch (e) {
        if(comments) console.log("Fail by IN_JI_EMIT" + e);
    }
}

//-------/copy functions---------
function fileToBuffer(str, port) {
    let str2 = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\" ?>\n<ClientInfo>\n    <Version>300</Version>\n    <UdpPort>" + port + "</UdpPort>\n    <Controler>0</Controler>\n    <SystemInfo>\n        <TotalMemory>1063239680</TotalMemory>\n        <TotalMemoryF>1063239680.000000</TotalMemoryF>\n        <NumCpus>2</NumCpus>\n        <Platform>Windows XP 6.1 Build 7601 - Service Pack 1</Platform>\n        <User>old</User>\n        <ComputerName>oldsea</ComputerName>\n        <Mac>001FE18133B60000</Mac>\n        <WorkDiskSPace>0</WorkDiskSPace>\n        <IPAddress>192.168.0.101</IPAddress>\n    </SystemInfo>\n</ClientInfo>\n0";
    //    let str2 = str.toString();
    var bytes = new Buffer.alloc(650);
    bytes.write(str2);
    return bytes;
}

function find_some_in_array(arr, sub, find_obj) {
    let targ = -1;
    for (let i in arr) {
        if (find_obj == arr[i][sub]) {
            targ = i;
            break;
        }
    }
    return targ;
}

/***UDP-PARSING FUNCTIONS***/
function udp_parser(msg, rinfo, mgr) {
    if(comments) console.log(`udpSock got: ${msg} from ${rinfo.address}:${rinfo.port}`);
    let hexCode, hexFirst, bufUsed;
    //    let json = {};
    //Рассматриваем часть буфера, содержащую специальный код:
    hexCode = msg.slice(19, 20).toString('hex');
    hexFirst = msg.slice(0, 1).toString('hex');
    if ((hexFirst == "10") || (hexFirst == "12") || (hexFirst == "13") || (hexFirst == "14")) {
        udp_grant_control(hexFirst, msg, mgr);
        return;
    }
    if(comments) console.log("UDP EVENT. code=", hexCode);
    switch (hexCode) {
        case "00":
            //In this case We Will Not Reconnect to Mgr, Because we think it was turned off by a human. If you start to send jobs in its queue - we start to connect!
            if (typeof book[mgr][UID] != 'undefined') {
                if(comments) console.log("Manager#" + book[mgr][UID] + " was Shutdown !!");
            }
            udp_mgr_off(mgr);
            break;
        case "02":
        case "04":
            break;
        case "06":
            if(comments) console.log("Job Restarted Event");
            break;

        case "07":
            if(comments) console.log("Some manipulation with server groups");
            //                udp_srvgroups(bufUsed,rinfo,mgr);
            //Some manipulation with server groups
            break;
            //Job Deleted
        case "08":
            bufUsed = msg.slice(20, 30);
            udp_job_deleted(bufUsed, rinfo, mgr);
            break;
        case "09": //OK
            bufUsed = msg.slice(20, 30);
            udp_new_job_appear(bufUsed, rinfo, mgr);
            break;
            //This Event can be considered as Last Frame    
        case "0b":
            bufUsed = msg.slice(20, 30);
            udp_last_frame(bufUsed, rinfo, mgr);
            break;
            //Job Render Finish Event
        case "0c":
            bufUsed = msg.slice(20, 50);
            udp_job_finish(bufUsed, rinfo, mgr);
            break;
            //Job Render Start Event
        case "0d":
            bufUsed = msg.slice(20, 50);
            udp_job_render_start(bufUsed, rinfo, mgr);
            udp_to_copy_tasks(bufUsed, rinfo, mgr);
            break;
            // suspend or activate job    
        case "0e": //OK
            bufUsed = msg.slice(20, 32);
            udp_job_state_changed(bufUsed, rinfo, mgr);
            break;
        case "0f":
            if(comments) console.log("Job Priority Changed!");
            bufUsed = msg.slice(20, 40);
            udp_job_priority_changed(bufUsed, rinfo, mgr);
            //Changed Job Priority
            break;
        case "10":
            bufUsed = msg.slice(20, 30);
            udp_job_restarted(bufUsed, rinfo, mgr);
            break;
            //Job was Reseted
        case "13":
            job_was_reseted(bufUsed, rinfo, mgr);
            break;
            // Job queuing up   
        case "14":
            bufUsed = msg.slice(20, 50);
            udp_job_queing_up(bufUsed, hexCode, rinfo, mgr);
            break;
            //Job render Cancelled by User or Aborted cause Wrong Path
        case "15":
            bufUsed = msg.slice(20, 50);
            udp_job_interrupt(bufUsed, rinfo, mgr);
            break;
            //Frames update   
        case "16":
            bufUsed = msg.slice(20, 50);
            udp_frame_update(bufUsed, rinfo, mgr);
            break;
        case "17":
            bufUsed = msg.slice(20, 50);
            udp_job_queing_up(bufUsed, hexCode, rinfo, mgr);
            udp_to_copy_tasks(bufUsed, rinfo, mgr);
            break;
        case "18":
        case "19":
        case "1a":
        case "1b":
        case "1c":
            bufUsed = msg.slice(20, 36);
            servers_events(bufUsed, hexCode, rinfo, mgr);
            break;
        case "73":
            if (typeof book[mgr][UID] != 'undefined')
                if(comments) console.log("New Monitor connected to MGR#" + book[mgr][UID]);
            break;

        default:
            if(comments) console.log("unhadled UDP: " + msg.toString('hex'));
            if(comments) console.log("toString: " + msg.toString());
            break;
    }
}

//Event '00'
function udp_mgr_off(m) {
    let js = {};
    js.fields = ["type", "ip", "port", "msg"];
    js.type = "mgr_off";
    if (typeof book[m] != 'undefined') {
        js.ip = book[m][HOST];
        js.port = book[m][TCPPORT];
        js.msg = "Manager#" + book[m][UID] + " was Normally Shutdown";
        book[m][CONTEXT] = "handshake_need";
    }
    mumo_callback(null, js,m);
}

// Event '07' Manipulations with Servers Groups
function udp_srvgroups(bufUsed, rinfo, mgr) {
    ///???????????????????
}

// Event '08' - Job Deleted
function udp_job_deleted(bufUsed, rinfo, mgr) {
    let job_pos = find_job_pos(bufUsed);
    let job_num = bufUsed.slice(0, job_pos).toString();
    if(comments) console.log("Job " + job_num + " Deleted!");
    let d = find_some_in_array(book[mgr][JOBS], JOBNUM, job_num);
    if (d > -1) {
        book[mgr][JOBS].splice(d, 1);
    }
    let js = {
        type: "job_deleted",
        fields: ["type", "ip", "port", "job", "msg"],
        ip: rinfo.address,
        port: book[mgr][TCPPORT],
        job: job_num,
        msg: "Job " + job_num + " was Deleted!"
    };
    mumo_callback(null, js,mgr);
}

//Event '09' New Job Appears
function udp_new_job_appear(bufUsed, rinfo, mgr) {
    let job_pos = find_job_pos(bufUsed);
    let job_num = bufUsed.slice(0, job_pos).toString();
    if(comments) console.log("New Job " + job_num + " Appears!");
    //
    if (find_some_in_array(book[mgr][JOBS], JOBNUM, job_num) == -1) {
        let job_arr = [];
        job_arr[JOBNUM] = job_num;
        book[mgr][JOBS].push(job_arr);
    }
    let js = {
        type: "new_job_appear",
        fields: ["type", "ip", "port", "job", "msg"],
        ip: rinfo.address,
        port: book[mgr][TCPPORT],
        job: job_num,
        msg: "New Job " + job_num + " was added!"
    };
    mumo_callback(null, js,mgr);
}

// Event '0b'
function udp_last_frame(bufUsed, rinfo, mgr) {
    //Номер работы может быть от 8 до 10 цифр
    let job_pos = find_job_pos(bufUsed);
    let job_num = bufUsed.slice(0, job_pos).toString();
    let js = {};
    js.fields = ["type", "ip", "port", "job", "frame", "percent"];
    js.type = "last_frame_update";
    js.ip = rinfo.address;
    js.port = book[mgr][TCPPORT];
    js.job = job_num;
    js.ms = 0;
    js.percent = 100;
    let pos = find_some_in_array(book[mgr][JOBS], JOBNUM, js.job);
    if (pos > -1) js.frame = Number(book[mgr][JOBS][pos][TASKS]);
    js.msg = "Job " + js.job + " All Frames Completed! 100 %";
    mumo_callback(null, js,mgr);
}

//Event '0c'
function udp_job_finish(bufUsed, rinfo, mgr) {
    let js = {};
    js.fields = ["type", "ip", "port", "job", "mac", "msg"];
    js.type = "job_render_end";
    js.ip = rinfo.address;
    js.port = book[mgr][TCPPORT];
    let job_pos = find_job_pos(bufUsed);
    js.job = bufUsed.slice(0, job_pos).toString();
    js.mac = bufUsed.slice(job_pos + 1, job_pos + 16).toString();
    js.msg = ("Server " + js.mac + " finished the job " + js.job);
    mumo_callback(null, js,mgr);
}

// Event '0d'
function udp_job_render_start(bufUsed, rinfo, mgr) {
    let js = {};
    js.fields = ["type", "ip", "port", "job", "msg"];
    js.ip = rinfo.address;
    js.port = book[mgr][TCPPORT];
    js.type = "job_render_start";
    let jobpos = find_job_pos(bufUsed);
    let jobnum = bufUsed.slice(0, jobpos).toString();
    js.job = jobnum;
    js.msg = "Job " + jobnum + " prepare to start (loading 3DMax Engine)";
    mumo_callback(null, js,mgr);
}

//Event '0e'
function udp_job_state_changed(bufUsed, rinfo, mgr) {
    let js = {};
    js.fields = ["type", "ip", "port", "job", "state", "msg"];
    js.ip = rinfo.address;
    js.port = book[mgr][TCPPORT];
    let job_pos = find_job_pos(bufUsed);
    js.job = bufUsed.slice(0, job_pos).toString();
    let state = bufUsed.slice(job_pos + 1, job_pos + 2).toString();
    js.state = state;
    js.type = "job_state_changed";
    if ((state == "1") || (state == "4")) {
        js.msg = "Job " + js.job + " is Activated (Remove from Pause after Suspend)";
    }
    if (state == "3") {
        js.msg = "Job " + js.job + " Suspended";
    }
    mumo_callback(null, js,mgr);
}

//Event '0f'
function udp_job_priority_changed(bufUsed, rinfo, mgr) {
    let js = {};
    js.fields = ["type", "ip", "port", "job", "priority", "msg"];
    js.ip = rinfo.address;
    js.port = book[mgr][TCPPORT];
    let job_pos = find_job_pos(bufUsed);
    js.job = bufUsed.slice(0, job_pos).toString();
    // !Доделать правильно, если приоритет 1 или 10
    if (bufUsed.slice(job_pos + 2, job_pos + 3).toString('hex') == "00") {
        js.priority = bufUsed.slice(job_pos + 1, job_pos + 2).toString();
    }
    if (bufUsed.slice(job_pos + 3, job_pos + 4).toString('hex') == "00") {
        js.priority = bufUsed.slice(job_pos + 1, job_pos + 3).toString();
    }
    js.type = "job_priority_changed";
    js.msg = "Job's " + js.job + " priority changed to " + js.priority;
    mumo_callback(null, js,mgr);
}

// Event '10' Job Restarted
function udp_job_restarted(bufUsed, rinfo, mgr) {
    let job_pos = find_job_pos(bufUsed);
    let job_num = bufUsed.slice(0, job_pos).toString();
    let js = {
        type: "job_restarted",
        fields: ["type", "ip", "port", "job", "msg"],
        ip: rinfo.address,
        port: book[mgr][TCPPORT],
        job: job_num,
        msg: "Job " + job_num + " was Restarted or Edited!"
    }
    mumo_callback(null, js,mgr);
}

// Event '13' Job was Reseted
function job_was_reseted(bufUsed, rinfo, mgr) {
    // command = del jobserver 717170087 E839DFB5FEEB0000

    //?????????????????????????????????????????????????????????

    //mac and job
}

// Event '15' OK
function udp_job_interrupt(bufUsed, rinfo, m) {
    let jobpos = find_job_pos(bufUsed);
    let jobnum = bufUsed.slice(0, jobpos).toString();
    let js = {};
    js.fields = ["type", "ip", "port", "job", "msg"];
    js.type = "render_error";
    js.ip = rinfo.address;
    js.port = book[m][TCPPORT];
    js.job = jobnum;

    book[m][IN_JI_PRM] = new Promise((resolve, reject) => {
        book[m][IN_JI_EMIT] = new EventEmitter;
        book[m][IN_JI_EMIT].once('done', function (obj) {
            resolve(obj);
        });
        setTimeout(() => {
            reject(new Error("Fail to get Information about Job Aborted Error"));
        }, 2000);
    });
    book[m][IN_JI_PRM].then(
        result => {
            if(comments) console.log("IN_JI_PRM Fulfilled: UDP get jobsrverrlst");
            //if(comments) console.log(JSON.stringify(result));
            js.msg = result.ServerErrorList.ServerMessage.Msg._text;
            mumo_callback(null, js);
        },
        error => {
            mumo_callback(null, js);
            if(comments) console.log("IN_JI_PRM Rejected: " + error.message);
        }
    );

    let cmdArr = [];
    cmdArr[ID] = "U1";
    cmdArr[HOST] = rinfo.address;
    cmdArr[TCPPORT] = book[m][TCPPORT];
    cmdArr[CMD] = "get jobsrverrorlst " + jobnum;
    mgrProxy(cmdArr);
}

// Events '14' and '17'
function udp_job_queing_up(bufUsed, hexCode, rinfo, mgr) {
    let js = {};
    js.fields = ["type", "ip", "port", "job", "mac", "msg"];
    js.ip = rinfo.address;
    js.port = book[mgr][TCPPORT];
    js.type = "job_queuing_up";
    let jobpos = find_job_pos(bufUsed);
    let jobnum = bufUsed.slice(0, jobpos).toString();
    if (hexCode == "14") {
        js.mac = bufUsed.slice(jobpos + 1, jobpos + 16).toString();
        js.msg = "TheServer " + js.mac + " plans to perform the following Job " + jobnum;
    } else js.msg = "Job " + jobnum + " is Queing up";
    mumo_callback(null, js,mgr);
}

// Event '16'
function udp_frame_update(bufUsed, rinfo, mgr, code) {
    let js = {};
    js.fields = ["type", "ip", "port", "job", "frame", "ms", "percent", "msg"];
    let job_pos = find_job_pos(bufUsed);
    js.type = "frame_update";
    js.job = bufUsed.slice(0, job_pos).toString();
    js.ip = rinfo.address;
    js.port = book[mgr][TCPPORT];
    let p = job_pos + 2; // 11
    while (bufUsed.slice(p, p + 1).toString('hex') != "20") {
        p++;
    }
    let frame = bufUsed.slice(job_pos + 1, p).toString();
    let b = p + 1;
    while (bufUsed.slice(b, b + 1).toString('hex') != "00") {
        b++;
    }
    let ms = bufUsed.slice(p + 1, b).toString();
    js.frame = frame;
    js.ms = ms;
    let tasks = -1;
    let pos = find_some_in_array(book[mgr][JOBS], JOBNUM, js.job);
    if (pos > -1) {
        tasks = Number(book[mgr][JOBS][pos][TASKS]);
    }
    if(comments) console.log("typeof tasks = " + typeof tasks);
    if (tasks == 'undefined') {
        udp_to_copy_tasks(bufUsed, rinfo, mgr);
    }
    if (typeof tasks == 'number') {
        let percent = Math.ceil(Number(frame) * 100 / tasks);
        if(comments) console.log("percents = " + percent + " %");
        js.percent = percent;
    } else {
        js.percent = 1;
        if(comments) console.log("Fail to calculate Job's complete percents!");
    }
    js.msg = "Job " + js.job + " Frames from 1 to " + frame + " of " + tasks + " completed, " + js.percent + " %";
    mumo_callback(null, js,mgr);
}

// Events '18', '19', '1a', '1b', '1c'
function servers_events(bufUsed, code, rinfo, mgr) {
    let js = {};
    js.fields = ["type", "ip", "port", "mac", "msg"];
    js.ip = rinfo.address;
    js.port = book[mgr][TCPPORT];
    js.mac = bufUsed.toString();
    switch (code) {
        case "18":
            js.type = "server_off";
            js.msg = "Server " + js.mac + " is offline!";
            break;
        case "19":
            js.type = "server_on";
            js.msg = "Server " + js.mac + " is Ready to Work!";
            break;
        case "1a":
            js.type = "server_free";
            js.msg = "Server " + js.mac + " has No Active Jobs!";
            break;
        case "1b":
            js.type = "render_aborted";
            js.msg = "Render App Closed By User or Aborted due to Wrong Path, on server " + js.mac;
            break;
        case "1c":
            js.type = "server_deleted";
            js.msg = "Server " + js.mac + " Was Deleted From Manager" + js.ip + ":" + js.port;
            break;
    }
    mumo_callback(null, js,mgr);
}

function udp_to_copy_tasks(bufUsed, rinfo, mgr) {
    let jobpos = find_job_pos(bufUsed);
    let jobnum = bufUsed.slice(0, jobpos).toString();
    let cmdArr = [];
    cmdArr[ID] = "U1";
    cmdArr[HOST] = rinfo.address;
    cmdArr[TCPPORT] = book[mgr][TCPPORT];
    cmdArr[CMD] = "get jobinfo " + jobnum;
    mgrProxy(cmdArr);
}

function find_job_pos(buf) {
    if (buf.slice(10, 11).toString('hex') == "00") return 10;
    if (buf.slice(10, 11).toString('hex') == "20") return 10;
    if (buf.slice(9, 10).toString('hex') == "00") return 9;
    if (buf.slice(9, 10).toString('hex') == "20") return 9;
    if (buf.slice(8, 9).toString('hex') == "00") return 8;
    if (buf.slice(8, 9).toString('hex') == "20") return 8;
}

function udp_grant_control(hexFirst, msg, mgr) {
    //We can say 'set controller No\r\n', so we Will Denied Control Passing
    //    if(comments) console.log("msg="+msg.toString('hex'));
    let js = {
        type: "control_grant",
        fields: ["type", "ip", "port", "name", "subtype", "msg"],
        ip: book[mgr][HOST],
        port: book[mgr][TCPPORT]
    };

    let start = 16;
    while (msg.slice(start, start + 1).toString('hex') != "00") {
        start++;
    }

    let name = msg.slice(16, start).toString();
    js.name = name;
    if (hexFirst == "10") {
        js.subtype = "10";
        js.msg = "The '" + name + "' host is Controller Now!";
    } else if (hexFirst == "12") {
        js.subtype = "12";
        js.msg = "The '" + name + "' host Request To Grant Control!";
    } else if (hexFirst == "13") {
        js.subtype = "13";
        js.msg = "The '" + name + "' host passed Control to us";
    } else if (hexFirst == "14") {
        js.subtype = "14";
        js.msg = "The '" + name + "' host Denied Control Grant";
    }
    mumo_callback(null, js,mgr);
}

/******UseFull Functions For Debug*****/
function reTtranslateTcpSocket(tcpSock) 
{
    if (tcpSock != undefined) {
        let em = tcpSock.emit;
        tcpSock.emit = function (event /*arg2, arg3, ..*/ ) {
            if(comments) console.log("tcpSocket emit:: ", event);
            em.apply(tcpSock, arguments);
        };
    }
}
function reTranslateUdpSocket(udpSock) 
{
    if (udpSock != undefined) {
        let em = udpSock.emit;
        udpSock.emit = function (event /*arg2, arg3, ..*/ ) {
            if(comments) console.log("udpSocket emit::: ", event);
            em.apply(udpSock, arguments);
        };
    }
}
function show_object_props(obj) 
{
    let str = "";
    for (let p in obj) {
        try {
            if (typeof obj[p] != 'function')
                str += p + "=" + obj[p] + "\r\n";
        } catch (e) {
            if(comments) console.log(e);
        }
    }
    if(comments) console.log(str);
    fs.writeFileSync("obj_props.txt", str);
}
function define_sock_state(sock)
{
    let res = "";
    let fd = sock.destroyed;
    let fl = (typeof sock.localAddress != 'undefined');
    let fr = (typeof sock.remoteAddress != 'undefined');
    
    if ((!fd) && (!fl) && (!fr)) {
        res = "tcpSocket object was created but link not establish";
        return false;
    }
    else if ((!fd) && (fl) && (fr)) {
        res = "establish!";
        return true;
    }
    else if ((fd) && (!fl) && (fr)) {
        res = "connection reseted";
        return false;
    }
    else if ((fd) && (!fl) && (!fr)) {
        res = "connection timeout";
        return false;
    }
}
function find_in_sockets(property, desire)
{
    let res = -1;
    for (let m in book)
    {
        if (book[m][property] == desire)
        {
            res = m;
            break;
        }
    }
    return res;
}

/************************
 *** Safron edit
 ************************/

function connect_to_manager(ip, port) 
{
    let cmdRow = ["S",ip,port,"safr_conn mgr"];
    //let mt = choose_or_prepare_manager(id, ip, port);
    let mt = mgrProxy(cmdRow);

    book[mt][SAFR_USING] = true;
    book[mt][EXT_CONN_PRM] = new Promise((resolve, reject) => {
        book[mt][EXT_CONN_EMIT] = new EventEmitter;
        book[mt][EXT_CONN_EMIT].once('in_conn_success', function () {
            book[mt][LOGIC_CONN] = true;
            resolve(book[mt][EXT_CONN_EMIT]);
        });
        book[mt][EXT_CONN_EMIT].once('in_conn_fail', function (e) {
            book[mt][LOGIC_CONN] = false;
            reject(e);
        });
        setTimeout(function(){
            reject("Something Wrong!");
        },2000);
        
    });
 
    return book[mt][EXT_CONN_PRM];
}

///===========================

function send_command() 
{}
send_command.prototype.send = function(arr){
    arr[0] = "S"+arr[0];
    let logic_connect = false;
    let uniqId = arr[HOST] + "_" + arr[TCPPORT];
    if(comments) console.log("-------arr[3]="+arr[3]);
    let mt = find_some_in_array(book, UID, uniqId);
    //let mt = mgrProxy(arr);
    if (mt > -1) logic_connect = true;
    else logic_connect =false;
    kit_counter = kit_counter++;
    if(comments) console.log("-------kit_counter="+kit_counter);
    if (logic_connect) {
            let kit = new Array;
            if(comments) console.log("СОЗДАЁМ НОВЫЙ kit В send_command()");
            kit.promise = new Promise((resolve, reject) => {
            
                kit.number = kit_counter;
                kit.emitter = new EventEmitter;
                kit.emitter.once('ext_cmd_done', function (js) {
                    resolve(js);
                });
                kit.emitter.once('ext_cmd_err', function (js) {
                    reject(js);
                });
            }); 
            mgrProxy(arr,kit);
            return kit.promise;
    }
    else return -1;
}

module.exports.send_command = send_command;
module.exports.connect = connect_to_manager;
