/*
 * grunt-optimusjs
 * 
 *
 * Copyright (c) 2013 Arne Strout, contributors
 * Licensed under the MIT license.
 */

'use strict';
// Required Modules
var path = require('path');
var fs = require('fs');
var colors = require('colors');
var prettyjson=require('prettyjson');
var merge = require('merge');
var mkpath = require('mkpath');


module.exports=function(grunt){
	// The path to the global module
	var _globalmod = '';
	// Configuration storage file
	var _configfile = '';
	// Configuration (paths cache)
	var _configdata = {};
	// Dependency cache
	var _dependencies = {};
	// Output folder
	var _outdir = '';
	// Watch integration
	var _watchhooked = false;
	var _watchtask = '';
	var _watchtarget = '';
	// JSHint integration
	var _jshinttask = '';

	// Acquires the module ID and relative path as an array of two elements
	var getModuleIDFromPath=function(file,relativeDir,absoluteDir,subprefix){
		var fnp = file.split('/');
		var fn=fnp[fnp.length-1];
		var rel = relativeDir.split('/');
		var abs = absoluteDir.split('/');
		if(rel[rel.length-1]==''){
			rel.pop();
		}
		if(abs[abs.length-1]==''){
			abs.pop();
		}
		var frag = fnp.slice(rel.length,fnp.length-1).join('/');
		if(fn.indexOf('.')>-1)fn=fn.substr(0,fn.lastIndexOf('.'));
		var fr2 = frag.split('/').slice(abs.length-rel.length).join("/");
		var ofn=fn;
		if(fn.substr(0,subprefix.length) === subprefix)fn=fn.substr(subprefix.length);
		return 	[(fr2!=""?fr2+"/":"")+fn,(frag!=""?frag+"/":"")+ofn];
	}

	var addDependencies=function(files,deps,relativeDir,absoluteDir,subprefix){
		var i=0,d=_dependencies;
		while(i<deps.length){
			grunt.log.writeln('--'+i+'='+deps[i]);
			var dep=deps[i];
			if(files.indexOf(dep)<0){
				files.push(dep);
				var tid=getModuleIDFromPath(dep,relativeDir,absoluteDir,subprefix)[0];
				if(d[tid] && d[tid].length>0){
					grunt.log.writeln("adding dependencies for:"+tid);
					files=addDependencies(files,d[tid],relativeDir,subprefix);
				}
			}
			i++;
		}
		return files;
	}

	var onWatchEvent=function(action,filepath,target){
		// Only perform optimizations for optimus JS targets
		if(target == _watchtask){
			// Set config options for the optimus task that set the watch call up
			grunt.config(['optimus',_watchtarget,'watchcall'],action);
			grunt.config(['optimus',_watchtarget,'watchcall'],filepath);
			grunt.config(['jshint',_jshinttask],filepath);
		}
	};


	/**
	Optimus task
	Runs through all JS files and prepares a require configuration based on the file structure and some parameters.
	**/
	grunt.registerMultiTask('optimus','Build a configuration for the R.JS optimizer from JS folder structure',function(){
		var options = this.options();
		var global = _globalmod=options.global;
		var inDir = options.inDir; // eg: 'src/js/'
		var outDir = options.outDir; // eg: 'static/js/'
		_outdir=outDir;
		var relativeDir = options.relativeDir;
		var absoluteDir = options.inDir.split('/');
		var subprefix = options.subprefix; // eg: '_'
		var configfile = options.configfile; // eg: 'requirepaths.out'
		var excludeforsub = typeof(options.excludeforsub)!=='undefined'?options.excludeforsub:[];
		var excludeforglobal = typeof(options.excludeforglobal)!=='undefined'?options.excludeforglobal:[];
		var exclude = options.exclude;
		var optimize = options.optimize; //uglify or none
		var files;
		var rj = grunt.config.get('requirejs');
		var watch = grunt.config.get('watch');
		var jshint = grunt.config.get('jshint');
		var filesglob=[''+inDir+"**/*.js"];

		if(!exclude){
			files=grunt.file.expand(''+inDir+"**/*.js");
		}else{
			if(!Array.isArray(exclude)){
				exclude=[exclude];
			}
			for(var i=0;i<exclude.length;i++){
				filesglob.push('!'+inDir+exclude[i]);
			}
			files=grunt.file.expand(filesglob);
		}

		if(typeof(options.jshinttask) !== 'undefined'){
			if(typeof(jshint) === 'undefined' ){
				jshint = {};
			}
			_jshinttask = options.jshinttask;
			if(typeof(jshint[_jshinttask]) === 'undefined'){
				grunt.config.set(['jshint',_jshinttask],filesglob);
				jshint=grunt.config.get('jshint');
				grunt.log.writeln("Added jshint task (jshint:"+_jshinttask+")\n"+prettyjson.render(jshint));
			}
		}
		if(typeof(options.watchtask) !== 'undefined'){
			if(typeof(watch) === 'undefined'){
				watch={};
			}
			if(typeof(watch[options.watchtask]) === 'undefined'){
				_watchtask = options.watchtask;
				_watchtarget = this.target;
				var watchlist = typeof(options.watchlist) !== 'undefined'?options.watchlist.split(','):[];
				watchlist.unshift('optimus:'+_watchtarget);

				watch[_watchtask] = {
					files:filesglob,
					tasks: watchlist,
					options:{
						spawn:false
					}
				}
				grunt.log.writeln("Added watch task:\n"+prettyjson.render(watch[_watchtask]));
				grunt.config.set('watch',watch);
				if(!_watchhooked){
					grunt.event.on('watch',onWatchEvent);
					_watchhooked=true;
				}
			}
		}
		
		if(typeof(options.jquery) !== 'undefined'){
			_jqueryfile=options.jquery;
		}

		if(absoluteDir[absoluteDir.length-1]===""){
			absoluteDir.pop();
		}
		absoluteDir=absoluteDir.join('/');

		if(!rj){
			rj={options:{}};
			grunt.config.set('requirejs',rj);
		}else{
			options.paths=options.paths!==undefined?merge(options.paths,rj.options.paths):rj.options.paths;
		}
		
		var paths = options.paths!==undefined ? options.paths:{};
		var storage=grunt.config('require-storage');
		if(!storage){
			grunt.config('require-storage',{
				paths:paths,
				dependencies:_dependencies
			});
		}
		
		paths=grunt.config('require-storage.paths');
		_dependencies=grunt.config('require-storage.dependencies');
		if(!_dependencies){
			grunt.log.writeln("dependencies are empty".red);
			_dependencies={};
		}

		var watchcall = options.watchcall;
		var watchtarget = options.watchtarget;
		var target = this.target;

		// A file was added, we need to rebuild the paths
		if(watchcall==="added"){
			paths={};
			options.paths={};
			_dependencies={};
		}

		grunt.log.writeln("OPTIMUS : Preparing Javascript Configuration"+(watchcall?" WC["+watchcall+"]/"+watchtarget:"."));
		grunt.log.writeln("-----------------------------");
		
		// If a file was added, or this is the only call, build paths from scratch
		if(watchcall!=="changed"){
			//console.log("Starting paths:\n %j",paths);
			// Add optimus-post config entries
			var cfg = grunt.config.get('optimus');
			var postcfg = {};
			for(var itm in cfg){
				postcfg[itm]={};
			}
			grunt.config.set('optimus-post',postcfg);
			// end config entry generation

			grunt.log.writeln("\n\nFILES:".blue,files);
			grunt.log.writeln("\n\nGenerating module paths and dependencies".green.underline);
			grunt.util.async.forEach(files,function(file,next){
				// Get the dependencies
				var fcont = grunt.file.read(file);
				var pat = /define\s*\(\s*\[([\s\S]*?)\]/m;
				var deps = fcont.match(pat);

				//if(deps!==null){
				//	grunt.log.writeln("--list:\n"+prettyjson.render(deps));
				//}

				if(deps && deps.length>1){
					deps=deps[1];
					//grunt.log.writeln("dependencies:".yellow+deps);
					deps=deps.split("\n").join('').split("\t").join('').split('"').join('').split("'").join('').split(" ").join('').split(',');
					grunt.log.writeln(file,deps);
				}else{
					deps=[];
				}
				// store depencency
				if(deps.length>0){
					grunt.util.async.forEach(deps,function(dep,next){
						if(!_dependencies[dep])_dependencies[dep]=[];
						if(_dependencies[dep].indexOf(file)<0){
							_dependencies[dep].push(file);
							//grunt.log.writeln("added depency ".green+dep+" for ".green+file);
						}
					});
				}

				// Insert a path entry
				var fileid=getModuleIDFromPath(file,relativeDir,absoluteDir,subprefix);
				grunt.log.writeln('>>'.blue+"path[".green+fileid[0]+"] = '".green+fileid[1]+"'".green);
				paths[fileid[0]]=fileid[1];
				options.paths=paths;
			});
		}else{ // If resulting from a changed file, find where it is referenced.
			files=[watchtarget,(options.relativeDir!=''?options.relativeDir+"/":'')+options.global+".js"];
			var targetid=getModuleIDFromPath(watchtarget,relativeDir,absoluteDir,subprefix)[0];
			grunt.log.writeln("Target ID:"+targetid);
			var targetdeps=_dependencies[targetid];
			grunt.log.writeln("Dependencies:",targetdeps);
			if(targetdeps && targetdeps.length>0){
				files=addDependencies(files,targetdeps,relativeDir,subprefix);
			}
		}


		if(!options.development){
			var rjo=rj.options?rj.options:{};

			if(options.shim){ // merge in the shim data from local config.
				rjo.shim = merge(rjo.shim,options.shim);
				options.shim=undefined; // clear once merged in
			}
			grunt.config.set('requirejs',{options:rjo});
			rj = grunt.config.get('requirejs');

			grunt.log.writeln("\n\nGenerating first level modules list".green.underline);
			grunt.util.async.forEach(files,function(file,next){
				var fnp = file.split('/');
				var fn=fnp[fnp.length-1];
				if(fn.substr(0,subprefix.length) !== subprefix){
					var fileid=getModuleIDFromPath(file,relativeDir,absoluteDir,subprefix);
					
					grunt.log.write(' >>'.yellow+(fileid[0]).green);
					
					var o={
						options:{
							baseUrl:'./'+relativeDir,
							paths:paths,
							name: fileid[0],
							out: outDir+fileid[1]+".js",
							optimize: options.optimize //uglify or none
						}
					};

					if(fileid[0]!==global){
						o.options.exclude=excludeforsub;
					}else{
						o.options.exclude=excludeforglobal;
						grunt.log.writeln((fileid[0]+" is the root/global module").grey);
					}
					
					rj[fileid[0]]=o;
				}
			});

			grunt.config.set('requirejs',rj);
		}

		if(configfile && watchcall!=="changed"){
			var co=options.config?options.config:{};
			co.paths=paths;
			_configdata=co;
			_configfile=configfile;
		}
		grunt.config(['require-storage','paths'],paths);
		grunt.config(['require-storage','dependencies'],_dependencies);
		grunt.log.writeln("\nOPTIMUS: Prepare complete".green);
		grunt.log.writeln("------------------------");
		grunt.log.writeln("RJ:"+prettyjson.render(rj));
		
		if(!options.development){
			grunt.task.run("requirejs","filerev","optimus-post:"+this.target);
		}else{
			_globalmod = "";
			grunt.util.async.forEach(files,function(file,next){
				var outfile=file.split('/');
				var rel=relativeDir.split('/');
				var outfile=outDir+file.split('/').slice(rel.length).join("/");
				grunt.log.writeln("copying for development:".yellow+outfile);
				mkpath.sync(path.dirname(outfile));
				fs.createReadStream(file).pipe(fs.createWriteStream(outfile));
			});
			if(typeof(_jshinttask) !== 'undefined'){
				grunt.task.run("jshint:"+_jshinttask,"optimus-post:"+this.target);
			}else{
				grunt.task.run("optimus-post:"+this.target);
			}
		}
	});


	/**
	Require-Post
	Prepends the paths config to the global module if a config was generated
	**/
	grunt.registerMultiTask('optimus-post','Prepend config data if config data was generated',function(){
		grunt.log.writeln("\nPrepending Configuration".green);
		grunt.log.writeln("cfg:".grey+_configfile);
		grunt.log.writeln("-----------------------------------------------------");
		var filereved = (typeof(grunt.filerev) !== 'undefined' && typeof(grunt.filerev.summary) !== 'undefined');
		if(_configdata && _configfile){
			if(filereved){
				grunt.log.writeln('Filerev found:'.green +"\n"+prettyjson.render(grunt.filerev.summary));
				for(var fp in _configdata.paths){
					grunt.log.writeln("Checking rev for:".blue+fp);
					var fn = _outdir+_configdata.paths[fp]+'.js';
					grunt.log.writeln("-revpath:".blue+fn);
					if(typeof(grunt.filerev.summary[fn]) !== 'undefined'){
						grunt.log.writeln("-overwrite with:".yellow + path.dirname(_configdata.paths[fp])+path.basename(grunt.filerev.summary[fn],'.js'));
						_configdata.paths[fp]=path.dirname(_configdata.paths[fp])+'/'+path.basename(grunt.filerev.summary[fn],'.js');
					}
				}
				grunt.log.writeln('Updated config with filerev:\n'+prettyjson.render(_configdata));
			}


			var s="/* Generated by require-prepare */\n\nvar req_config="+JSON.stringify(_configdata,null,4)+";\nrequire.config(req_config);\n\n\n";
			grunt.log.writeln("Writing config file...".magenta);
			fs.writeFileSync(_configfile,s);
		}
	});
};