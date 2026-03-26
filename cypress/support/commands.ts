/// <reference types="cypress" />
// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
//
// declare global {
//   namespace Cypress {
//     interface Chainable {
//       login(email: string, password: string): Chainable<void>
//       drag(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       dismiss(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       visit(originalFn: CommandOriginalFn, url: string, options: Partial<VisitOptions>): Chainable<Element>
//     }
//   }
// }

interface SyncMock { 
    resolve: ((responseBody: any) => void);
}

interface LoadSessionOptions {
    initialSync: any;
}

declare global {
    namespace Cypress {
        interface Chainable {
            stubCors(hostname?: string): Chainable<void>;
            exportIDB(dbName: string): Promise<string>;
            importIDB(dbName: string): Promise<void>;
            clearIDB(dbName: string): Promise<void>;
            loadSession(sessionName: string, options?: LoadSessionOptions): Chainable<{
                homeserverBaseUrl: string;
                sync: SyncMock;
            }>;
        }
    }
}

export function exportIDBToJson(idbDatabase: IDBDatabase): Promise<string> {
    return new Promise((resolve, reject) => {
        const exportObject = {}
        if (idbDatabase.objectStoreNames.length === 0) {
        resolve(JSON.stringify(exportObject))
        } else {
        const transaction = idbDatabase.transaction(
            idbDatabase.objectStoreNames,
            'readonly'
        )

        transaction.addEventListener('error', reject)

        for (const storeName of idbDatabase.objectStoreNames) {
            const allObjects: any[] = []
            transaction
                .objectStore(storeName)
                .openCursor()
                .addEventListener('success', event => {
                    const cursor = (event.target as any).result
                    if (cursor) {
                        // Cursor holds value, put it into store data
                        allObjects.push(cursor.value)
                        cursor.continue()
                    } else {
                        // No more values, store is done
                        (exportObject as any)[storeName] = allObjects

                        // Last store was handled
                        if (
                            idbDatabase.objectStoreNames.length ===
                            Object.keys(exportObject).length
                        ) {
                            resolve(JSON.stringify(exportObject))
                        }
                    }
                })
            }
        }
    })
}

export function importIDBFromJson(idbDatabase: IDBDatabase, json: string) {
    return new Promise<void>((resolve, reject) => {
        const transaction = idbDatabase.transaction(
            idbDatabase.objectStoreNames,
            'readwrite'
        )
        transaction.addEventListener('error', reject)

        var importObject = JSON.parse(json)
        for (const storeName of idbDatabase.objectStoreNames) {
            let count = 0
            for (const toAdd of importObject[storeName]) {
                const request = transaction.objectStore(storeName).add(toAdd)
                request.addEventListener('success', () => {
                    count++
                    if (count === importObject[storeName].length) {
                        // Added all objects for this store
                        delete importObject[storeName]
                        if (Object.keys(importObject).length === 0) {
                            // Added all object stores
                            resolve()
                        }
                    }
                })
            }
        }
    })
}

export function clearDatabase(idbDatabase: IDBDatabase) {
    return new Promise<void>((resolve, reject) => {
        const transaction = idbDatabase.transaction(
        idbDatabase.objectStoreNames,
            'readwrite'
        )
        transaction.addEventListener('error', reject)

        let count = 0
        for (const storeName of idbDatabase.objectStoreNames) {
            transaction
                .objectStore(storeName)
                .clear()
                .addEventListener('success', () => {
                    count++
                    if (count === idbDatabase.objectStoreNames.length) {
                        // Cleared all object stores
                        resolve()
                    }
                })
        }
    })
}

Cypress.Commands.add('exportIDB', (dbName) => new Cypress.Promise(async (resolve) => {
    indexedDB.open(dbName).onsuccess = async (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        const json = await exportIDBToJson(db)
        localStorage.setItem(dbName, json)
        resolve(json)
    }
}))

Cypress.Commands.add('importIDB', (dbName) => new Cypress.Promise(async (resolve) => {
    const json = localStorage.getItem(dbName)
    if (!json) {
        resolve()
        return
    }
    indexedDB.open(dbName).onsuccess = async (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        await clearDatabase(db)
        await importIDBFromJson(db, json.toString())
        resolve()
    }
}))

Cypress.Commands.add('clearIDB', (dbName) => new Cypress.Promise(async (resolve) => {
    indexedDB.open(dbName).onsuccess = async (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        await clearDatabase(db)
        resolve()
    }
}))

Cypress.Commands.add('loadSession', (sessionName: string, options?: LoadSessionOptions) => {

    cy.visit('http://localhost:5173/?language=e2e')

    cy.clearIDB('discortix')

    cy.window().then(win => {
        win.localStorage.setItem('mx_access_token', 'ACCESS_TOKEN')
        win.localStorage.setItem('mx_device_id', 'DEVICE_ID')
        win.localStorage.setItem('mx_user_id', `@${sessionName}:example.com`)
        win.localStorage.setItem('mx_profile_displayname', sessionName)
    })

    cy.task('readJson', '/config.json').then((appConfig: any) => {
        const homeserverBaseUrl = appConfig.defaultServerConfig['m.homeserver'].baseUrl

        cy.window().then(win => {
            win.localStorage.setItem('mx_hs_url', homeserverBaseUrl)
        })
    })

    let homeserverBaseUrl: string = ''
    let sync: SyncMock = {
        resolve: () => {},
    }

    return cy.window().then(win => {
        homeserverBaseUrl = win.localStorage.getItem('mx_hs_url') ?? ''
    }).then(() => {
        cy.intercept('POST', `${homeserverBaseUrl}/_matrix/client/v3/keys/query`, {
            statusCode: 200,
            body: {},
            headers: { 'content-type': 'application/json' },
        })

        cy.intercept('GET', `${homeserverBaseUrl}/_matrix/client/v3/sync*`, (request) => {
            if (request.query.since) {
                return new Promise((resolve) => {
                    let resolved = false

                    const safeResolve = (response: any) => {
                        if (resolved) return
                        resolved = true
                        clearTimeout(timer)
                        request.reply(response)
                        resolve()
                    }

                    sync.resolve = (syncResponse: any) => {
                        safeResolve({
                            statusCode: 200,
                            body: { ...syncResponse, next_batch: 'FOOBAR' },
                            headers: { 'content-type': 'application/json' },
                        })
                    }

                    const timer = setTimeout(() => {
                        safeResolve({
                            statusCode: 200,
                            body: {
                                next_batch: 'FOOBAR',
                            },
                            headers: { 'content-type': 'application/json' },
                        })
                    }, 30000)
                })
            } else {
                request.reply({
                    status: 200,
                    body: {
                        ...(options?.initialSync ?? {}),
                        next_batch: 'FOOBAR',
                    },
                    headers: { 'content-type': 'application/json' },
                })
            }

        }).as('syncRequest')

    }).then(() => {
        return cy.wrap({
            homeserverBaseUrl,
            sync,
        })
    })
})

Cypress.Commands.add('stubCors', (hostname = 'https://api.example.com') => {
    cy.intercept('OPTIONS', `${hostname}/**`, {
        statusCode: 204,
        headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'access-control-allow-headers': '*',
        },
    }).as('preflight')
})

export {}