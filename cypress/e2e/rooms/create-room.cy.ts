/// <reference types="cypress" />

describe('rooms/create-room', () => {

    it('can handle errors when creating a direct message room', () => {

        const initialSync = {
            presence: {
                events: [
                    {
                        content: {
                            currentlyActive: true,
                            displayname: 'user2',
                            lastActiveAgo: Date.now(),
                            presence: 'online',
                        },
                        type: 'm.presence',
                        sender: '@user2:example.com'
                    }
                ]
            }
        }

        cy.loadSession('user1', { initialSync }).then((sessionInfo) => {
            const { homeserverBaseUrl, sync } = sessionInfo

            cy.visit('http://localhost:5173/home?language=e2e')

            cy.wait('@syncRequest')

            cy.get('#sidebar-list-direct-messages-create-message-button')
                .click()
            
            cy.get('#new-message-dialog-cancel-button')
                .should('be.focused')

            cy.get('.user-checkbox-list__item:first').click()

            // No API responds

            cy.get('#new-message-dialog-create-room-button').click()
            
            cy.get('#message-beginning-enable-encryption-toggle')
                .should('not.be.checked')
            
            cy.get('.joined-room__chat-bar-input .p-textarea')
                .type('hello{enter}')
            
            cy.get('.p-toast-message-error')
                .should('contain.text', 'createRoom.errorCreatingRoomToast')
            
            cy.get('.p-toast-close-button')
                .click()
            
            cy.location('pathname').should('eq', '/home')

            // Room creation API responds, send message fails

            cy.get('#sidebar-list-direct-messages-create-message-button')
                .click()
            
            cy.get('#new-message-dialog-cancel-button')
                .should('be.focused')

            cy.get('.user-checkbox-list__item:first').click()

            cy.get('#new-message-dialog-create-room-button').click()
            
            cy.get('#message-beginning-enable-encryption-toggle')
                .should('not.be.checked')
            
            cy.intercept('POST', `${homeserverBaseUrl}/_matrix/client/v3/createRoom`, {
                statusCode: 200,
                body: {
                    room_id: '!CREATED_ROOM_ID',
                },
                headers: { 'content-type': 'application/json' },
            }).as('createRoomRequest')
            
            cy.get('.joined-room__chat-bar-input .p-textarea')
                .type('hello{enter}')
            
            cy.get('.p-toast-message-error')
                .should('contain.text', 'createRoom.errorSendingFirstMessageToast')
                
            cy.get('.p-toast-close-button')
                .click()
                
            cy.wait('@createRoomRequest').then(() => {
                const roomCreateEvent = {
                    content: {
                        additionalCreators: ['@user2:example.com'],
                        roomVersion: '12',
                    },
                    event_id: '$1',
                    origin_server_ts: 1,
                    sender: '@user1:example.com',
                    state_key: '',
                    type: 'm.room.create',
                }

                const roomPowerLevelsEvent = {
                    content: {
                        state_default: 50,
                        users_default: 0,
                    },
                    event_id: '$2',
                    origin_server_ts: 2,
                    sender: '@user1:example.com',
                    state_key: '',
                    type: 'm.room.power_levels',
                }

                const member1JoinEvent = {
                    content: {
                        displayname: 'user1',
                        membership: 'join',
                    },
                    event_id: '$3',
                    origin_server_ts: 3,
                    sender: '@user1:example.com',
                    state_key: '',
                    type: 'm.room.member',
                }

                const member2InviteEvent = {
                    content: {
                        displayname: 'user2',
                        membership: 'invite',
                    },
                    event_id: '$4',
                    origin_server_ts: 4,
                    sender: '@user1:example.com',
                    state_key: '@user2:example.com',
                    type: 'm.room.member',
                }

                sync.resolve({
                    rooms: {
                        join: {
                            '!CREATED_ROOM_ID': {
                                state: {
                                    events: [
                                        roomCreateEvent,
                                        roomPowerLevelsEvent,
                                        member1JoinEvent,
                                        member2InviteEvent,
                                    ],
                                },
                                timeline: {
                                    events: [
                                        roomCreateEvent,
                                        roomPowerLevelsEvent,
                                        member1JoinEvent,
                                        member2InviteEvent,
                                    ]
                                },
                            }
                        }
                    }
                })
            })

            cy.location('pathname').should('eq', '/room/!CREATED_ROOM_ID')
            
        })

    })

    it('can create an unencrypted direct message room', () => {

        const initialSync = {
            presence: {
                events: [
                    {
                        content: {
                            currentlyActive: true,
                            displayname: 'user2',
                            lastActiveAgo: Date.now(),
                            presence: 'online',
                        },
                        type: 'm.presence',
                        sender: '@user2:example.com'
                    }
                ]
            }
        }

        cy.loadSession('user1', { initialSync }).then((sessionInfo) => {
            const { homeserverBaseUrl, sync } = sessionInfo

            cy.visit('http://localhost:5173/home?language=e2e')

            cy.wait('@syncRequest')

            cy.get('#sidebar-list-direct-messages-create-message-button')
                .click()
            
            cy.get('#new-message-dialog-cancel-button')
                .should('be.focused')

            cy.get('.user-checkbox-list__item:first').click()

            cy.get('#new-message-dialog-create-room-button').click()
            
            cy.get('#message-beginning-enable-encryption-toggle')
                .should('not.be.checked')

            cy.intercept('POST', `${homeserverBaseUrl}/_matrix/client/v3/createRoom`, (request) => {
                const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body

                expect(body).to.have.property('initial_state')
                expect(body.initial_state.length).to.equal(0)

                expect(body).to.have.property('is_direct')
                expect(body.is_direct).to.equal(true)

                expect(body).to.have.property('preset')
                expect(body.preset).to.equal('trusted_private_chat')

                expect(body).to.have.property('invite')
                expect(body.invite.length).to.equal(1)
                expect(body.invite[0]).to.equal('@user2:example.com')

                request.reply({
                    statusCode: 200,
                    body: {
                        room_id: '!CREATED_ROOM_ID',
                    },
                    headers: { 'content-type': 'application/json' },
                })
            }).as('createRoomRequest')

            cy.intercept('PUT', `${homeserverBaseUrl}/_matrix/client/v3/rooms/!CREATED_ROOM_ID/send/m.room.message/*`, (request) => {

                request.reply({
                    statusCode: 200,
                    body: {
                        event_id: '$FIRST_MESSAGE_EVENT_ID',
                    },
                    headers: { 'content-type': 'application/json' },
                })
            }).as('sendFirstEventRequest')

            cy.get('.joined-room__chat-bar-input .p-textarea')
                .type('hello{enter}')
            
            cy.wait('@createRoomRequest')
            cy.wait('@sendFirstEventRequest').then(() => {
                const roomCreateEvent = {
                    content: {
                        additionalCreators: ['@user2:example.com'],
                        roomVersion: '12',
                    },
                    event_id: '$1',
                    origin_server_ts: 1,
                    sender: '@user1:example.com',
                    state_key: '',
                    type: 'm.room.create',
                }

                const roomPowerLevelsEvent = {
                    content: {
                        state_default: 50,
                        users_default: 0,
                    },
                    event_id: '$2',
                    origin_server_ts: 2,
                    sender: '@user1:example.com',
                    state_key: '',
                    type: 'm.room.power_levels',
                }

                const member1JoinEvent = {
                    content: {
                        displayname: 'user1',
                        membership: 'join',
                    },
                    event_id: '$3',
                    origin_server_ts: 3,
                    sender: '@user1:example.com',
                    state_key: '',
                    type: 'm.room.member',
                }

                const member2InviteEvent = {
                    content: {
                        displayname: 'user2',
                        membership: 'invite',
                    },
                    event_id: '$4',
                    origin_server_ts: 4,
                    sender: '@user1:example.com',
                    state_key: '@user2:example.com',
                    type: 'm.room.member',
                }

                const member1MessageEvent = {
                    content: {
                        body: 'hello',
                        msgtype: 'm.text',
                    },
                    event_id: '$5',
                    origin_server_ts: 5,
                    sender: '@user1:example.com',
                    state_key: '',
                    type: 'm.room.message',
                }

                sync.resolve({
                    rooms: {
                        join: {
                            '!CREATED_ROOM_ID': {
                                state: {
                                    events: [
                                        roomCreateEvent,
                                        roomPowerLevelsEvent,
                                        member1JoinEvent,
                                        member2InviteEvent,
                                    ],
                                },
                                timeline: {
                                    events: [
                                        roomCreateEvent,
                                        roomPowerLevelsEvent,
                                        member1JoinEvent,
                                        member2InviteEvent,
                                        member1MessageEvent,
                                    ]
                                },
                            }
                        }
                    }
                })
                
            })

            cy.location('pathname').should('eq', '/room/!CREATED_ROOM_ID')

            cy.get('#message-history-beginning')
                .should('contain.text', 'room.directMessageHistoryBeginning')

            cy.get('.p-chattimeline-event[data-event-id="$5"]')
                .should('contain.text', 'hello')

        })
    })

})