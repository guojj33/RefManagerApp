const express = require('express')
const fs = require('fs')
const formidable = require('formidable') 
const bodyParser = require('body-parser')
const app = express()
const cproc = require('node:child_process')
var bibtexParse = require('@orcid/bibtex-parse-js');
const path = require('path')
const { stdout } = require('process')

app.use(bodyParser.json())

app.all('*', function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    res.header("Access-Control-Allow-Methods","PUT,POST,GET,DELETE,OPTIONS");
    res.header("X-Powered-By",' 3.2.1')
    res.header("Content-Type", "application/json");
    next();
})

app.use(express.static(__dirname))

function printErr(err) {
    if (err != null)
        console.error(err)
}

function rmElemenet(array, element) {
    let index = array.indexOf(element)
    array.splice(index, 1)
}

app.post('/template', (req, res) => {
    const form = new formidable.IncomingForm()
    form.parse(req, async (err, fields, files) => {
        console.log(fields)
        if (err == null) {
            res.send('ok')
        }
    })
})

const documentPath = __dirname + '/documents'
const refDataPath = documentPath + '/data.json'

function updateRefData(func1, func2 = () => {}) {
    fs.readFile(refDataPath, (err, content) => {
        printErr(err)
        let refData = JSON.parse(content)
        func1(refData) // 读取json后调用
        let s = JSON.stringify(refData)
        fs.writeFile(refDataPath, s, (err) => {
            func2() // 修改完json后调用
        })
    })
}

app.post('/add_attachment', (req, res) => {
    const form = new formidable.IncomingForm();
    form.uploadDir = documentPath + '/.cache'
    form.keepExtensions = true
    form.parse(req, (err, fields, files) => {
        file = files.file
        tmpFilePath = file.filepath
        dstFilePath = documentPath + '/' + fields.selectedFolder + '/' + fields.selectedRef + '/' + file.originalFilename
        console.log('move \'%s\' -> \'%s\'', tmpFilePath, dstFilePath)
        fs.copyFile(tmpFilePath, dstFilePath, fs.constants.COPYFILE_EXCL, (err) => {
            fs.rm(tmpFilePath, (err) => {})
            printErr(err)
            if (err == null) {
                // update refData
                function func1(refData) {
                    refData[fields.selectedFolder][fields.selectedRef].attachments.push(file.originalFilename) // 附件只保存文件名，打开时再计算完整相对路径
                    res.send({"refData": refData})
                }
                updateRefData(func1)
            }
            else {
                res.status(403).send(err)
            }
        })
    })
})

app.post('/rm_attachment', (req, res) => {
    const form = new formidable.IncomingForm()
    form.parse(req, (err, fields, files) => {
        console.log(fields)
        let path = documentPath + '/' + fields.folderName + '/' + fields.refName + '/' + fields.fileName
        fs.rm(path, err => {
            printErr(err)
            if (err == null) {
                function func1(refData) {
                    rmElemenet(refData[fields.folderName][fields.refName].attachments, fields.fileName)
                }
                updateRefData(func1)
                res.send('ok')
            }
            else {
                res.status(403).send(err)
            }
        })
    })
})

app.post('/add_folder', (req, res) => {
    const form = new formidable.IncomingForm()
    form.parse(req, async (err, fields, files) => {
        printErr(err)
        folderName = fields.folderName
        // 创建文件夹成功再修改json
        fs.mkdir(documentPath + '/' + folderName, (err) => {
            printErr(err)
            if (err == null) {
                function func1(refData) {
                    refData.folders.push(folderName)
                    refData[folderName] = {refers: []}
                }
                updateRefData(func1)
                res.send('ok')
            }
            else {
                res.status(403).send(err)
            }
        })
    })
})

app.post('/rm_folder', (req, res) => {
    const form = new formidable.IncomingForm()
    form.parse(req, (err, fields, files) => {
        folderName = fields.folderName
        // 删除文件夹成功再修改json
        fs.rmdir(documentPath + '/' + folderName, (err) => {
            printErr(err)
            if (err == null) {
                function func1(refData) {
                    rmElemenet(refData.folders, folderName)
                    delete refData[folderName]
                }
                updateRefData(func1)
                res.send('ok')
            }
            else {
                res.status(403).send(err)
            }
        })
    })
})

app.post('/add_ref', (req, res) => {
    const form = new formidable.IncomingForm()
    form.parse(req, (err, fields, files) => {
        console.log(fields)
        folderName = fields.folderName
        let newRefForm = {
            title: fields.title,
            author: fields.author,
            year: fields.year,
            from: fields.from,
            rate: 0,
            note: '',
            attachments: []
        }
        let dstPath = documentPath + '/' + folderName + '/' + newRefForm.title
        // console.log(dstPath)
        fs.access(dstPath, err => {
            printErr(err)
            if (err == null) { // 文件夹已存在
                res.status(403).send('ref already exists!')
            }
            else {
                fs.mkdir(dstPath, err => {
                    printErr(err)
                    if (err == null) {
                        function func1(refData) {
                            refData[folderName].refers.push(newRefForm.title)
                            refData[folderName][newRefForm.title] = newRefForm
                        }
                        updateRefData(func1)
                        res.send('ok')
                    }
                    else {
                        res.status(403).send(err)
                    }
                })
            }
        })
    })
})

app.post('/mv_ref', (req, res) => {
    const form = new formidable.IncomingForm()
    form.parse(req, (err, fields, files) => {
        console.log(fields)
        let oldPath = documentPath + '/' + fields.oldFolderName + '/' + fields.refName
        let dstPath = documentPath + '/' + fields.dstFolderName + '/' + fields.refName
        console.log('try to move \"%s\" -> \"%s\"', oldPath, dstPath)
        fs.access(dstPath, err => {
            if (err == null) { // already exists
                res.status(403).send('same file already exists in the folder!')
            }
            else {
                fs.rename(oldPath, dstPath, err => {
                    if (err != null) {
                        res.status(403).send(err)
                    }
                    else {
                        function func1(refData) {
                            refData[fields.dstFolderName].refers.push(fields.refName)
                            refData[fields.dstFolderName][fields.refName] = refData[fields.oldFolderName][fields.refName]
                            rmElemenet(refData[fields.oldFolderName].refers, fields.refName)
                            delete refData[fields.oldFolderName][fields.refName]
                            console.log('move \"%s\" -> \"%s\"', oldPath, dstPath)
                            res.send({'refData': refData})
                        }
                        updateRefData(func1)
                    }
                })
            }
        })
    })
})

app.post('/rm_ref', (req, res) => {
    const form = new formidable.IncomingForm()
    form.parse(req, (err, fields, files) => {
        console.log(fields)
        dstPath = documentPath + '/' + fields.folderName + '/' + fields.refName
        fs.rmdir(dstPath, err => {
            printErr(err)
            if (err == null) {
                function func1(refData) {
                    rmElemenet(refData[fields.folderName].refers, fields.refName)
                    delete refData[fields.folderName][fields.refName]
                }
                updateRefData(func1)
                res.send('ok')
            }
            else {
                res.status(403).send(err)
            }
        })
    })
})

function changeInArray(array, oldx, newx) {
    let index = array.indexOf(oldx)
    array[index] = newx
}

app.post('/change_folder_name', (req, res) => {
    const form = new formidable.IncomingForm()
    form.parse(req, (err, fields, files) => {
        console.log(fields)
        let oldPath = documentPath + '/' + fields.oldFolderName
        let newPath = documentPath + '/' + fields.newFolderName
        fs.access((newPath), err => {
            if (err == null) {
                res.status(403).send('folder already exists!')
            }
            else {
                fs.rename(oldPath, newPath, err => {
                    if (err == null) {
                        function func1(refData) {
                            changeInArray(refData.folders, fields.oldFolderName, fields.newFolderName)
                            refData[fields.newFolderName] = refData[fields.oldFolderName]
                            delete refData[fields.oldFolderName]
                            res.send({'refData': refData})
                        }
                        updateRefData(func1)
                    }
                    else {
                        res.status(403).send(err)
                    }
                })
            }
        })
    })
})

app.post('/change_ref_title', (req, res) => {
    const form = new formidable.IncomingForm()
    form.parse(req, (err, fields, files) => {
        console.log(fields)
        if (err == null) {
            let oldPath = documentPath + '/' + fields.folderName + '/' + fields.oldTitle
            let newPath = documentPath + '/' + fields.folderName + '/' + fields.newTitle
            fs.access((newPath), err => {
                if (err == null) { // 新路径已存在，修改失败
                    res.status(403).send('title already exists in same folder!')
                }
                else {
                    fs.rename(oldPath, newPath, err => {
                        if (err == null) {
                            function func1(refData) {
                                changeInArray(refData[fields.folderName].refers, fields.oldTitle, fields.newTitle)
                                refData[fields.folderName][fields.newTitle] = refData[fields.folderName][fields.oldTitle]
                                delete refData[fields.folderName][fields.oldTitle]
                                refData[fields.folderName][fields.newTitle].title = fields.newTitle
                                res.send({'refData': refData})
                            }
                            updateRefData(func1)
                        }
                        else {
                            res.status(403).send(err)
                        }
                    })
                }
            })
        }
    })
})

app.post('/change_ref_prop', (req, res) => {
    const form = new formidable.IncomingForm()
    form.parse(req, async (err, fields, files) => {
        if (err == null) {
            console.log(fields)
            function func1(refData) {
                let oldValue = refData[fields.folderName][fields.refName][fields.prop]
                if (oldValue != undefined) {
                    let newValue = fields.newValue
                    if (fields.prop == 'rate')
                        newValue = Number(newValue)
                    refData[fields.folderName][fields.refName][fields.prop] = newValue
                    console.log(oldValue + '->' + newValue)
                }
            }
            updateRefData(func1)
            res.send('ok')
        }
        else {
            res.status(403).send(err)
        }
    })
})

app.post('/parse_bib', (req, res) => {
    const form = new formidable.IncomingForm()
    form.parse(req, (err, fields, files) => {
        // console.log(fields)
        let bibStr = fields.bibStr
        bibParsed = bibtexParse.toJSON(bibStr)
        // console.log(bibParsed)
        if (bibParsed.length == 0) {
            res.status(403).send('fail to parse')
            console.log('fail to parse')
        }
        else {
            res.send({'bibParsed': bibParsed[0]})
        }
    })
})

app.post('/open_dir', (req, res) => {
    const form = new formidable.IncomingForm()
    form.parse(req, (err, fields, files) => {
        let path = __dirname + '\\' + fields.path
        let cmd = "explorer \"" + path + "\"" // 路径中可能有空格，故加双引号
        console.log(cmd)
        cproc.exec(cmd, (err, stdout, stderr) => { // 对比spawn
            if (err == null) {
                res.send('ok')
            }
            else {
                console.log(err)
                res.status(403).send(err)
            }
        })
    })
})

app.post('/open_path', (req, res) => {
    const form = new formidable.IncomingForm()
    form.parse(req, (err, fields, files) => {
        let path = __dirname + '/' + fields.path
        let cmd = "\"" + path + "\""
        console.log(cmd)
        cproc.exec(cmd, (err, stdout, stderr) => {
            if (err == null) {
                res.send('ok')
            }
            else {
                res.status(403).send(err)
            }
        })
    })
})

app.get('/data', (req, res) => {
    console.log('get refData...')
    fs.readFile(refDataPath, (err, content) => {
        let refData = JSON.parse(content)
        res.send({'refData': refData})
    })
})

app.get('/hello', (req, res) => {
    console.log('hello from front-end')
    res.send('hi')
})

const port = 4331
const server = app.listen(port, err => {
    if(!err) {
        // stdout.write('running...')
        console.log('running at %d', port)
    }
})
// module.exports = app

app.get('/close', (req, res) => {
    console.log('server closing')
    res.send('server closed')
    server.close(() => {
        console.log('server closed')
    })
})