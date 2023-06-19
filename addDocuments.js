const dotenv = require("dotenv");
dotenv.config();

const CryptoJS = require('crypto-js');

const fs = require("fs");
const PDFJS = require('pdfjs-dist');

const { Client } = require('@elastic/elasticsearch');

// 'use strict'

const client = new Client({
    node: process.env.ELASTIC_URL,
    auth: {
        username: process.env.ELASTIC_USERNAME,
        password: process.env.ELASTIC_PASSWORD
    },
    tls: {
        rejectUnauthorized: false
    }
});

const catcher = (error) => {console.error(error)}

const add = async (pdfFileName) => {
    try {
        await PDFJS.getDocument(`pdfs/${pdfFileName}`).promise.then(async (data) => {
            let documentContent = [];
            for (let i = 1; i <= data.numPages; i++) {
                await data.getPage(i).then(async (page) => {
                    await page.getTextContent().then((content) => {
                        if (content.items.length === 0) return;

                        let pageText = content.items[0].str.toLowerCase();
    
                        for (let j = 1; j < content.items.length; j++) {
                            let currentY = content.items[j].transform[5];
                            let previousY = content.items[j-1].transform[5];
                            if (currentY != previousY) pageText += '\n';
    
                            pageText += content.items[j].str.toLowerCase();
                        }
    
                        documentContent.push(pageText);
                    }).catch((error) => {
                        console.log(error);
                    })
                }).catch((error) => {
                    console.log(`error getting page ${i}`)
                })
            }

            try {
                let  = await client.index({
                    index: "search-db",
                    id: CryptoJS.SHA256(pdfFileName).toString(),
                    body: {
                        name: pdfFileName,
                        content: documentContent
                    }
                });
        
                await client.indices.refresh({
                    index: "search-db"
                });
            } catch (error) {
                console.log(error)
            }
        }).catch((error) => {
            console.log(`error reading pdf ${pdfFileName}`)
        });
    
        console.log(`successfully added document: ${pdfFileName}`)
    } catch (error) {
        console.log(`failed to add document: ${pdfFileName}`)
    }
}

async function addAll() {
    let result = await client.search({
        index: "search-db",            
        body: {
            query: {
                match_all: {}
            }
        }
    });

    let documentNameSet = new Set();
    for (let i = 0; i < result.hits.hits.length; i++) {
        documentNameSet.add(result.hits.hits[i]._source.name)
    }
    
    let pdfDocuments = fs.readdirSync("pdfs");
    for (let pdfFileName of pdfDocuments) {
        if (documentNameSet.has(pdfFileName)) {
            console.log(`document already indexed: ${pdfFileName}`)
            continue;
        }
        await add(pdfFileName);
    }
}

// addAll()