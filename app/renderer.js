"use strict";

const fs = require('fs');
const ejs = require('ejs');
const path = require('path');
const async = require('async');

const titleParser = require('./parsers/title_parser');
const xejsParser = require('./parsers/xejs_parser');
const tocParser = require('./parsers/toc_parser');
const frontMatterParser = require('./parsers/front_matter');

const resourcesPath = __dirname + "/../resources";

const defaultOptions = {
    highlight: true,
    style: true,
    minify: false,
    tags: true,
    frontMatter: true,
    koala: false
};

function removeFileExtension(filename) {
    if (!filename) return "";
    let filenameArr = filename.split(".");
    if (filenameArr.length > 1) filenameArr.pop();
    return filenameArr.join(".");
}

function parseFilename(filepath) {
    if (!filepath) return "";
    let filename = path.basename(filepath);
    return removeFileExtension(filename);
}

function setDefaultOptions() {
    let res = {};
    Object.assign(res, defaultOptions);
    res.resourcesPath = resourcesPath;
    return res;
}

function loadFile(file, options, done) {
    fs.readFile(file, 'utf8', function(err, data) {
        if (err) return done(new Error("Error reading file: " + err));
        else return done(null, data);
    });
}


//Class to render from one file to another
module.exports = class Renderer {
    constructor(options, template, inputParser) {
        this.options = setDefaultOptions();
        this.setOptions(options);
        this.xejsTokens = []; //modify this to add new xejs tokens
        this.setTemplate(template);
        this.parser = inputParser;
        this.name = "default";

        if (this.options.tags) this.fileLoader = this.loadFileXEJS;
        else this.fileLoader = loadFile;
    }

    setOptions(options) {
        if (options) {
            Object.assign(this.options, options);
        }
    }


    //To extend

    //args filename
    beforeLoad() {
        //Modify filename or this.fileLoader
    }

    //args templateOptions
    beforeRender() {
        //Modify templateData before rendering
    }

    //args: content, filename, done
    fileOutput() {
        //Write file
    }

    //Public
    renderFile(files, options, done) {
        if (!done && typeof options === "function") {
            done = options;
            options = {};
        }
        if (!Array.isArray(files)) files = [files];
        let renderOptions=this.generateRenderOptions(files,options);
        
        this.loadFiles(files, renderOptions, (err, rawContent) => {
            if (err) return done(err);
            this.beforeParseRender(rawContent, renderOptions, (err, res) => {
                if (err) console.log("Warning:" + err);
                rawContent = res;
                this.contentParse(rawContent, renderOptions, (err, content) => {
                    if (err) return done(err);
                    this.renderTemplate(content, renderOptions, (err, res) => {
                        if (err) return done(err);
                        this.fileOutput(res, renderOptions.outputFilename, done);
                    });
                });
            });
        });
    }

    //Private
    generateRenderOptions(files,options){
        let renderOptions = options || {};
        Object.assign(renderOptions, this.options);
        if (!renderOptions.outputFilename) renderOptions.outputFilename = parseFilename(files[0]);
        return renderOptions;
    }
    
    
    beforeParseRender(rawContent, renderOptions, done) {
        frontMatterParser(rawContent, (err, res, attr) => {
            if (err) console.log("Warning:" + err);
            if (renderOptions.frontMatter) {
                rawContent = res;
                Object.assign(renderOptions, attr);
            }
            tocParser(rawContent, done);
        });
    }

    renderTemplate(content, renderOptions, done) {
        let title = this.getTitle(content, renderOptions);
        let templateData = this.setTemplateOptions(renderOptions);
        templateData.content = content;
        templateData.title = title;
        this.beforeRender(templateData);
        this.templateRender(templateData, done);
    }

    loadFiles(files, renderOptions, done) {
        this.beforeLoad(files);
        let rawContent = "";

        async.each(files, (file, cb) => {
            this.fileLoader(file, renderOptions, (err, res) => {
                rawContent += res;
                cb(err);
            });
        }, (err) => {
            done(err, rawContent);
        });
    }

    getTitle(parsedContent, options) {
        return options.title || titleParser.html(parsedContent) || parseFilename(options.outputFilename);
    }

    setTemplate(template) {
        if (!template) this.template = null;
        else this.template = __dirname + "/../templates/" + template;
    }

    setTemplateOptions(options) {
        let files = fs.readdirSync(__dirname + "/../styles");
        let index = files.indexOf(options.style);
        let styleFile = "github.css";

        if (index > -1) {
            styleFile = files[index];
            options.style = true;
        }

        return {
            styleFile: styleFile,
            highlight: options.highlight && options.requireHighlight,
            style: options.style,
            resourcesPath: options.resourcesPath,
            koala: options.koala,
            output: this.output,
            fs: fs
        };
    }

    contentParse(content, options, done) {
        this.parser(content, options, done);
    }
    templateRender(data, done) {
        ejs.renderFile(this.template, data, {}, done);
    }
    loadFileXEJS(file, options, done) {
        xejsParser(file, options, this.xejsTokens, done);
    }
};
