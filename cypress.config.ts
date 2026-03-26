import fs from 'fs'
import path from 'path'
import { defineConfig } from 'cypress'

const appConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '/config.json'), 'utf8'))

export default defineConfig({
    allowCypressEnv: false,
    defaultCommandTimeout: 60000,
    requestTimeout: 60000,

    e2e: {
        blockHosts: [
            appConfig.defaultServerConfig['m.homeserver'].baseUrl.replace(/^https?:\/\//, ''),
            'homeserver1.example.com',
            'homeserver2.example.com',
        ],
        setupNodeEvents(on, config) {
            const fs = require('fs')
            on('task', {
                readJson(filePath) {
                    return JSON.parse(fs.readFileSync(path.join(__dirname, filePath), 'utf8'))
                },
            })
        },
    },
})
