/// <reference types="cypress" />

let homeserverBaseUrl = ''

describe('login/with-password', () => {
    before(() => {
        cy.task('readJson', '/config.json')
            .then((appConfig: any) => {
                homeserverBaseUrl = appConfig.defaultServerConfig['m.homeserver'].baseUrl
            })
    })

    it('shows an error when default homeserver does not respond and retries successfully', () => {
        cy.visit('http://localhost:5173/login?language=e2e')

        cy.get('.login-page .p-message-error')
            .should('contain.text', 'errors.discoverHomeserver.title')
            .should('contain.text', 'errors.discoverHomeserver.serverDown')

        cy.intercept('GET', `${homeserverBaseUrl}/_matrix/client/versions`, {
            statusCode: 200,
            body: {
                versions: ['v1.17']
            },
            headers: { 'content-type': 'application/json' },
        })

        cy.get('#login-server-discovery-retry-button')
            .click()
        
        cy.get('.p-progressbar', { timeout: 8000 }).should('not.exist')

        cy.get('.login-page .p-message-error')
            .should('contain.text', 'errors.discoverHomeserver.title')
            .should('contain.text', ' errors.discoverHomeserver.serverDown')

        cy.intercept('GET', `${homeserverBaseUrl}/_matrix/client/v3/login`, {
            statusCode: 500,
        })

        cy.get('#login-server-discovery-retry-button')
            .click()
        
        cy.get('.p-progressbar', { timeout: 8000 }).should('not.exist')

        cy.get('.login-page .p-message-error')
            .should('contain.text', 'errors.discoverHomeserver.title')
            .should('contain.text', ' errors.discoverHomeserver.httpError')
        
        cy.intercept('GET', `${homeserverBaseUrl}/_matrix/client/v3/login`, {
            statusCode: 200,
            body: {
                flows: [
                    { type: 'm.login.password' }
                ]
            },
            headers: { 'content-type': 'application/json' },
        })

        cy.get('#login-server-discovery-retry-button')
            .click()
        
        cy.get('.p-progressbar', { timeout: 8000 }).should('not.exist')
        
        cy.get('.login-page .p-message-error')
            .should('not.exist')
    })

    it('can change the target homeserver', () => {
        cy.intercept('GET', `${homeserverBaseUrl}/_matrix/client/versions`, {
            statusCode: 200,
            body: {
                versions: ['v1.17']
            },
            headers: { 'content-type': 'application/json' },
        })
        cy.intercept('GET', `${homeserverBaseUrl}/_matrix/client/v3/login`, {
            statusCode: 200,
            body: {
                flows: [
                    { type: 'm.login.password' }
                ]
            },
            headers: { 'content-type': 'application/json' },
        })

        cy.visit('http://localhost:5173/login?language=e2e')

        cy.get('#login-edit-homeserver')
            .click()

        cy.get('.p-dialog-close-button').should('be.focused');

        // Server does not respond

        cy.get('#homeserver-host.p-inputtext')
            .clear()
            .type('homeserver1.example.com')
            .should('have.value', 'homeserver1.example.com')

        cy.get('button[form="homeserver-change-form"]')
            .click()

        cy.get('.p-dialog .p-message-error')
            .should('contain.text', 'errors.discoverHomeserver.serverDown')

        cy.get('#homeserver-host.p-inputtext')
            .clear()
            .type('homeserver2.example.com')
            .should('have.value', 'homeserver2.example.com')

        // Server responds with bad status

        cy.intercept('GET', `https://homeserver2.example.com/_matrix/client/versions`, {
            statusCode: 500,
        })
        cy.intercept('GET', `https://homeserver2.example.com/_matrix/client/v3/login`, {
            statusCode: 500,
        })

        cy.get('button[form="homeserver-change-form"]')
            .click()
        
        cy.get('.p-dialog .p-message-error')
            .should('contain.text', 'errors.discoverHomeserver.httpError')

        // Issue with response schema

        cy.intercept('GET', `https://homeserver1.example.com/_matrix/client/versions`, {
            statusCode: 200,
            body: {
                versions: ['v1.17']
            },
            headers: { 'content-type': 'application/json' },
        })
        cy.intercept('GET', `https://homeserver1.example.com/_matrix/client/v3/login`, {
            statusCode: 200,
            body: {},
            headers: { 'content-type': 'application/json' },
        })

        cy.get('#homeserver-host.p-inputtext')
            .clear()
            .type('homeserver1.example.com')
            .should('have.value', 'homeserver1.example.com')
        
        cy.get('button[form="homeserver-change-form"]')
            .click()
        
        cy.get('.p-dialog .p-message-error')
            .should('contain.text', 'errors.discoverHomeserver.schemaValidation')
        
        // Discovery success

        cy.intercept('GET', `https://homeserver2.example.com/_matrix/client/versions`, {
            statusCode: 200,
            body: {
                versions: ['v1.17']
            },
            headers: { 'content-type': 'application/json' },
        })
        cy.intercept('GET', `https://homeserver2.example.com/_matrix/client/v3/login`, {
            statusCode: 200,
            body: {
                flows: [
                    { type: 'm.login.password' }
                ]
            },
            headers: { 'content-type': 'application/json' },
        })

        cy.get('#homeserver-host.p-inputtext')
            .clear()
            .type('homeserver2.example.com')
            .should('have.value', 'homeserver2.example.com')
        
        cy.get('button[form="homeserver-change-form"]')
            .click()
        
        cy.get('.p-dialog').should('not.exist')

        cy.get('#login-selected-homeserver-name')
            .should('contain.text', 'https://homeserver2.example.com')
        
        // Proceed to login successfully

        cy.get('#login-username')
            .clear()
            .type('username')
            .should('have.value', 'username')

        cy.get('#login-password')
            .clear()
            .type('password')
            .should('have.value', 'password')

        cy.intercept('POST', `https://homeserver2.example.com/_matrix/client/v3/login`, {
            statusCode: 200,
            body: {
                access_token: 'ACCESS_TOKEN',
                device_id: 'DEVICE_ID',
                user_id: '@username:example.com',
            },
            headers: { 'content-type': 'application/json' },
        })

        cy.get('#login-submit-button')
            .click()
        
        cy.get('#login-submit-button.p-button-loading').should('not.exist')

        cy.location('pathname').should('eq', '/home')
    })

    it('submits an email identifier when the username field looks like an email', () => {
        cy.intercept('GET', `${homeserverBaseUrl}/_matrix/client/versions`, {
            statusCode: 200,
            body: {
                versions: ['v1.17']
            },
            headers: { 'content-type': 'application/json' },
        })
        cy.intercept('GET', `${homeserverBaseUrl}/_matrix/client/v3/login`, {
            statusCode: 200,
            body: {
                flows: [
                    { type: 'm.login.password' }
                ]
            },
            headers: { 'content-type': 'application/json' },
        })

        cy.visit('http://localhost:5173/login?language=e2e')

        cy.get('#login-username')
            .clear()
            .type('username@example.com')
            .should('have.value', 'username@example.com')

        cy.get('#login-password')
            .clear()
            .type('password')
            .should('have.value', 'password')

        cy.intercept('POST', `${homeserverBaseUrl}/_matrix/client/v3/login`, (request) => {
            const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body

            expect(body).to.have.property('type')
            expect(body.type).to.equal('m.login.password')

            expect(body).to.have.property('identifier')
            expect(body.identifier).to.have.property('type')
            expect(body.identifier.type).to.equal('m.id.thirdparty')
            expect(body.identifier).to.have.property('medium')
            expect(body.identifier.medium).to.equal('email')
            expect(body.identifier).to.have.property('address')
            expect(body.identifier.address).to.equal('username@example.com')

            expect(body).to.have.property('initial_device_display_name')

            expect(body).to.have.property('password')
            expect(body.password).to.equal('password')

            expect(body).to.not.have.property('device_id')

            expect(body).to.not.have.property('session')

            request.reply({
                statusCode: 200,
                body: {
                    access_token: 'ACCESS_TOKEN',
                    device_id: 'DEVICE_ID',
                    user_id: '@username:example.com',
                },
                headers: { 'content-type': 'application/json' },
            })
        })

        cy.get('#login-submit-button')
            .click()
        
        cy.get('#login-submit-button.p-button-loading').should('not.exist')

        cy.location('pathname').should('eq', '/home')
    })

    it('submits a phone identifier when the username field looks like a phone number', () => {
        cy.intercept('GET', `${homeserverBaseUrl}/_matrix/client/versions`, {
            statusCode: 200,
            body: {
                versions: ['v1.17']
            },
            headers: { 'content-type': 'application/json' },
        })
        cy.intercept('GET', `${homeserverBaseUrl}/_matrix/client/v3/login`, {
            statusCode: 200,
            body: {
                flows: [
                    { type: 'm.login.password' }
                ]
            },
            headers: { 'content-type': 'application/json' },
        })

        cy.visit('http://localhost:5173/login?language=e2e')

        cy.get('#login-username')
            .clear()
            .type('+819012345678')
            .should('have.value', '+819012345678')

        cy.get('#login-password')
            .clear()
            .type('password')
            .should('have.value', 'password')

        cy.intercept('POST', `${homeserverBaseUrl}/_matrix/client/v3/login`, (request) => {
            const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body

            expect(body).to.have.property('type')
            expect(body.type).to.equal('m.login.password')

            expect(body).to.have.property('identifier')
            expect(body.identifier).to.have.property('type')
            expect(body.identifier.type).to.equal('m.id.phone')
            expect(body.identifier).to.have.property('country')
            expect(body.identifier.country).to.equal('JP')
            expect(body.identifier).to.have.property('phone')
            expect(body.identifier.phone).to.equal('+819012345678')

            expect(body).to.have.property('initial_device_display_name')

            expect(body).to.have.property('password')
            expect(body.password).to.equal('password')

            expect(body).to.not.have.property('device_id')

            expect(body).to.not.have.property('session')

            request.reply({
                statusCode: 200,
                body: {
                    access_token: 'ACCESS_TOKEN',
                    device_id: 'DEVICE_ID',
                    user_id: '@username:example.com',
                },
                headers: { 'content-type': 'application/json' },
            })
        })

        cy.get('#login-submit-button')
            .click()
        
        cy.get('#login-submit-button.p-button-loading').should('not.exist')

        cy.location('pathname').should('eq', '/home')
    })

    it('shows the password entry form, exhausts error scenarios, and authenticates successfully', () => {
        cy.intercept('GET', `${homeserverBaseUrl}/_matrix/client/versions`, {
            statusCode: 200,
            body: {
                versions: ['v1.17']
            },
            headers: { 'content-type': 'application/json' },
        })
        cy.intercept('GET', `${homeserverBaseUrl}/_matrix/client/v3/login`, {
            statusCode: 200,
            body: {
                flows: [
                    { type: 'm.login.password' }
                ]
            },
            headers: { 'content-type': 'application/json' },
        })

        cy.visit('http://localhost:5173/login?language=e2e')

        // Submit form without filling in username or password

        cy.get('#login-username')
            .clear()
        
        cy.get('#login-password')
            .clear()
        
        cy.get('#login-submit-button')
            .click()
        
        cy.get('#login-username ~ .p-message-error')
            .should('contain.text', 'login.usernameRequired')
        
        cy.get('#login-password ~ .p-message-error')
            .should('contain.text', 'login.passwordRequired')
        
        // Submit without filling in password

        cy.get('#login-username')
            .clear()
            .type('username')
            .should('have.value', 'username')
        
        cy.get('#login-submit-button')
            .click()
        
        cy.get('#login-username ~ .p-message-error').should('not.exist')

        cy.get('#login-password ~ .p-message-error')
            .should('contain.text', 'login.passwordRequired')
        
        // Submit without filling in username

        cy.get('#login-username')
            .clear()

        cy.get('#login-password')
            .clear()
            .type('password')
            .should('have.value', 'password')
        
        cy.get('#login-submit-button')
            .click()
        
        cy.get('#login-username ~ .p-message-error')
            .should('contain.text', 'login.usernameRequired')

        cy.get('#login-password ~ .p-message-error').should('not.exist')
        
        // Submit with both fields, API rejects invalid credentials

        cy.get('#login-username')
            .clear()
            .type('bad_username')
            .should('have.value', 'bad_username')
        
        cy.intercept('POST', `${homeserverBaseUrl}/_matrix/client/v3/login`, {
            statusCode: 403,
            body: {
                errcode: 'M_FORBIDDEN'
            },
            headers: { 'content-type': 'application/json' },
        })

        cy.get('#login-submit-button')
            .click()
        
        cy.get('#login-submit-button.p-button-loading').should('not.exist')

        cy.get('#login-username ~ .p-message-error')
            .should('contain.text', 'login.invalidUsernameOrPassword')
        
        cy.get('#login-password ~ .p-message-error')
            .should('contain.text', 'login.invalidUsernameOrPassword')
        
        // Submit with both fields, API rejects with user not found

        cy.intercept('POST', `${homeserverBaseUrl}/_matrix/client/v3/login`, {
            statusCode: 404,
            body: {
                errcode: 'M_NOT_FOUND'
            },
            headers: { 'content-type': 'application/json' },
        })

        cy.get('#login-submit-button')
            .click()

        cy.get('#login-submit-button.p-button-loading').should('not.exist')

        cy.get('#login-username ~ .p-message-error')
            .should('contain.text', 'login.invalidUsernameOrPassword')
        
        cy.get('#login-password ~ .p-message-error')
            .should('contain.text', 'login.invalidUsernameOrPassword')
        
        // Show rate limit error

        cy.get('#login-username')
            .clear()
            .type('username')
            .should('have.value', 'username')
        
        cy.intercept('POST', `${homeserverBaseUrl}/_matrix/client/v3/login`, {
            statusCode: 429,
            body: {
                errcode: 'M_LIMIT_EXCEEDED'
            },
            headers: { 'content-type': 'application/json' },
        })

        cy.get('#login-submit-button')
            .click()
        
        cy.get('#login-submit-button.p-button-loading').should('not.exist')
        
        cy.get('.login-page .p-message-error')
            .should('contain.text', 'errors.rateLimited')
        
        // Show user deactivated

        cy.intercept('POST', `${homeserverBaseUrl}/_matrix/client/v3/login`, {
            statusCode: 403,
            body: {
                errcode: 'M_USER_DEACTIVATED'
            },
            headers: { 'content-type': 'application/json' },
        })

        cy.get('#login-submit-button')
            .click()

        cy.get('#login-submit-button.p-button-loading').should('not.exist')
        
        cy.get('.login-page .p-message-error')
            .should('contain.text', 'login.userDeactivated')

        // Show unexpected error

        cy.intercept('POST', `${homeserverBaseUrl}/_matrix/client/v3/login`, {
            statusCode: 500,
        })

        cy.get('#login-submit-button')
            .click()

        cy.get('#login-submit-button.p-button-loading').should('not.exist')
        
        cy.get('.login-page .p-message-error')
            .should('contain.text', 'errors.unexpected')
        
        // Login success

        cy.intercept('POST', `${homeserverBaseUrl}/_matrix/client/v3/login`, (request) => {
            const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body

            expect(body).to.have.property('type')
            expect(body.type).to.equal('m.login.password')

            expect(body).to.have.property('identifier')
            expect(body.identifier).to.have.property('type')
            expect(body.identifier.type).to.equal('m.id.user')
            expect(body.identifier).to.have.property('user')
            expect(body.identifier.user).to.equal('username')

            expect(body).to.have.property('initial_device_display_name')

            expect(body).to.have.property('password')
            expect(body.password).to.equal('password')

            expect(body).to.not.have.property('device_id')

            expect(body).to.not.have.property('session')

            request.reply({
                statusCode: 200,
                body: {
                    access_token: 'ACCESS_TOKEN',
                    device_id: 'DEVICE_ID',
                    user_id: '@username:example.com',
                },
                headers: { 'content-type': 'application/json' },
            })
        })

        cy.get('#login-submit-button')
            .click()
        
        cy.get('#login-submit-button.p-button-loading').should('not.exist')

        cy.location('pathname').should('eq', '/home')
    })
})