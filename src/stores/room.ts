import { computed, ref, toRaw } from 'vue'
import { defineStore, storeToRefs } from 'pinia'

import { useBroadcast } from '@/composables/broadcast'
import { useEventTimeline } from '@/composables/event-timeline'
import { useSessionStore } from '@/stores/session'

import {
    loadTableKey as loadDiscortixTableKey,
    saveTableKey as saveDiscortixTableKey,
} from '@/stores/database/discortix'

import {
    type RoomSummary,
    type InvitedRoom,
    type KnockedRoom,
    type JoinedRoom,
    type LeftRoom,
    eventContentSchemaByType,
    type ApiV3RoomMessagesResponse,
    type ApiV3SyncAccountDataEvent,
    type ApiV3SyncClientEventWithoutRoomId,
    type ApiV3SyncStrippedStateEvent,
    type ApiV3SyncResponse,
    type ApiV3SyncLeftRoom,
    type ApiV3SyncTimeline,
    type EventRoomRedactionContent,
} from '@/types'

const { isEventVisible, redactEvent } = useEventTimeline()

function isRoomStateEventType(type: string) {
    return /^(m\.room|m\.space)/.test(type)
}

function getRoomStateEventsByType(room: InvitedRoom, type: string): ApiV3SyncStrippedStateEvent[];
function getRoomStateEventsByType(room: KnockedRoom, type: string): ApiV3SyncStrippedStateEvent[];
function getRoomStateEventsByType(room: JoinedRoom, type: string): ApiV3SyncClientEventWithoutRoomId[];
function getRoomStateEventsByType(room: LeftRoom, type: string): ApiV3SyncClientEventWithoutRoomId[];
function getRoomStateEventsByType(room: any, type: string) {
    let eventsByType = room.stateEventsByType[type]
    if (!eventsByType) {
        eventsByType = []
        room.stateEventsByType[type] = eventsByType
    }
    return eventsByType
}

function addInvitedRoomStateEvent(room: InvitedRoom, event: ApiV3SyncStrippedStateEvent) {
    const eventContentParse = eventContentSchemaByType[event.type as keyof typeof eventContentSchemaByType]?.safeParse(event.content)
    if (!eventContentParse?.success) return

    const eventsByType = getRoomStateEventsByType(room, event.type)

    // Remove existing event based on type.
    const outdatedEventIndices = eventsByType.reduce((accumulator, currentValue, currentIndex) => {
        if (currentValue.stateKey === event.stateKey) {
            accumulator.push(currentIndex)
        }
        return accumulator
    }, [] as number[])
    for (let i = outdatedEventIndices.length - 1; i >= 0; i--) {
        const indexInEventTypeArray = outdatedEventIndices[i]
        if (indexInEventTypeArray == null) continue
        eventsByType.splice(indexInEventTypeArray, 1)
    }
    
    // Add new state event.
    eventsByType.push(event)
}

function addKnockedRoomStateEvent(room: KnockedRoom, event: ApiV3SyncStrippedStateEvent) {
    const eventContentParse = eventContentSchemaByType[event.type as keyof typeof eventContentSchemaByType]?.safeParse(event.content)
    if (!eventContentParse?.success) return

    const eventsByType = getRoomStateEventsByType(room, event.type)

    // Remove existing event based on type.
    const outdatedEventIndices = eventsByType.reduce((accumulator, currentValue, currentIndex) => {
        if (currentValue.stateKey === event.stateKey) {
            accumulator.push(currentIndex)
        }
        return accumulator
    }, [] as number[])
    for (let i = outdatedEventIndices.length - 1; i >= 0; i--) {
        const indexInEventTypeArray = outdatedEventIndices[i]
        if (indexInEventTypeArray == null) continue
        eventsByType.splice(indexInEventTypeArray, 1)
    }
    
    // Add new state event.
    eventsByType.push(event)
}

function addJoinedOrLeftRoomStateEvent(room: JoinedRoom | LeftRoom, event: ApiV3SyncClientEventWithoutRoomId) {
    const eventContentParse = eventContentSchemaByType[event.type as keyof typeof eventContentSchemaByType]?.safeParse(event.content)
    if (!eventContentParse?.success) return
    
    const eventsByType = getRoomStateEventsByType(room, event.type)

    // Redact existing event.
    if (event.type === 'm.room.redaction') {
        const redactionId = (event.content as EventRoomRedactionContent).redacts
        if (redactionId) {
            const redactedEvent = room.stateEventsById[redactionId]
            if (redactedEvent) {
                redactEvent(redactedEvent)
            }
        }
    }

    // If an event exists with the same event ID, remove it.
    const eventIdIndex = eventsByType.findIndex((otherEvent) => otherEvent.eventId === (event as ApiV3SyncClientEventWithoutRoomId).eventId)
    if (eventIdIndex > -1) {
        eventsByType.splice(eventIdIndex, 1)
        delete room.stateEventsById[eventIdIndex]
    }

    // Remove existing event based on type / eventId.
    const replaceEventId = event.unsigned?.replacesState
    if (replaceEventId) {
        const eventIdIndex = eventsByType.findIndex((otherEvent) => otherEvent.eventId === replaceEventId)
        if (eventIdIndex > -1) {
            eventsByType.splice(eventIdIndex, 1, event)
        }
        delete room.stateEventsById[replaceEventId]
    } else {
        const outdatedEventIndices = eventsByType.reduce((accumulator, currentValue, currentIndex) => {
            if (currentValue.stateKey === event.stateKey) {
                accumulator.push(currentIndex)
            }
            return accumulator
        }, [] as number[])
        for (let i = outdatedEventIndices.length - 1; i >= 0; i--) {
            const indexInEventTypeArray = outdatedEventIndices[i]
            if (eventsByType[i]?.eventId) {
                delete room.stateEventsById[eventsByType[i]!.eventId!]
            }
            if (indexInEventTypeArray != null) {
                eventsByType.splice(indexInEventTypeArray, 1)
            }
        }
    }

    // Add new state event.
    eventsByType.push(event)
    room.stateEventsById[event.eventId] = event
}

/** Merges event into the timeline in server timestamp order. Returns true if it was a duplicate event. */
function addJoinedOrLeftRoomTimelineEvent(
    room: JoinedRoom | LeftRoom,
    event: ApiV3SyncClientEventWithoutRoomId
): boolean {
    let timeline = isEventVisible(event) ? room.visibleTimeline : room.invisibleTimeline

    // Process redaction
    if (event.type === 'm.room.redaction') {
        const redactedEventId = event.content?.redacts
        const eventIndex = getTimelineEventIndexById(room.visibleTimeline, redactedEventId)
        if (eventIndex == -1 || eventIndex == null) {
            room.redactions.push(redactedEventId)
        } else {
            const redactedVisibleEvent = room.visibleTimeline.splice(eventIndex, 1)[0]
            if (redactedVisibleEvent) {
                redactEvent(redactedVisibleEvent)
            }

            const redactedInvisibleEvent = room.invisibleTimeline.splice(eventIndex, 1)[0]
            if (redactedInvisibleEvent) {

                removeReaction:
                if (redactedInvisibleEvent.type === 'm.reaction') {
                    const relatesTo = redactedInvisibleEvent.content?.['m.relates_to']
                    const relatedEventId: string | undefined = relatesTo?.eventId
                    const reactionKey: string | undefined = relatesTo?.key
                    if (!relatedEventId || !reactionKey || !room.reactions[relatedEventId]) break removeReaction
                    let reactionIndex = room.reactions[relatedEventId].findIndex(
                        (reaction) => reaction.key === reactionKey
                    )
                    const reaction = room.reactions[relatedEventId][reactionIndex]
                    if (!reaction) break removeReaction
                    const reactionEventIndex = reaction.events.findIndex(
                        (event) => event.eventId === redactedInvisibleEvent.eventId
                    )
                    const reactionEvent = reaction.events[reactionEventIndex]
                    if (!reactionEvent) break removeReaction
                    reaction.events.splice(reactionEventIndex, 1)
                    if (reaction.events.length === 0) {
                        room.reactions[relatedEventId].splice(reactionIndex, 1)
                    }
                    if (room.reactions[relatedEventId].length === 0) {
                        delete room.reactions[relatedEventId]
                    }
                }

                redactEvent(redactedInvisibleEvent)
                if (redactedInvisibleEvent.type !== 'm.room.redaction') {
                    addJoinedOrLeftRoomTimelineEvent(room, redactedInvisibleEvent)
                }
            }
        }
    } else if (room.redactions.includes(event.eventId)) {
        room.redactions.splice(room.redactions.indexOf(event.eventId), 1)
        redactEvent(event)
        timeline = room.invisibleTimeline
    }

    // Process reaction
    if (event.type === 'm.reaction') {
        const relatesTo = event.content?.['m.relates_to']
        const relatedEventId: string | undefined = relatesTo?.eventId
        const reactionKey: string | undefined = relatesTo?.key
        if (relatedEventId && reactionKey) { // Redacted reaction is missing these properties
            if (!room.reactions[relatedEventId]) {
                room.reactions[relatedEventId] = []
            }
            let reactionIndex = room.reactions[relatedEventId].findIndex(
                (reaction) => reaction.key === reactionKey
            )
            if (reactionIndex === -1) {
                room.reactions[relatedEventId].push({
                    key: reactionKey,
                    ts: event.originServerTs,
                    events: []
                })
                reactionIndex = 0
            }
            const reaction = room.reactions[relatedEventId][reactionIndex]
            if (reaction) {
                reaction.events.push({
                    eventId: event.eventId,
                    sender: event.sender,
                })
                if (event.originServerTs < reaction.ts) {
                    reaction.ts = event.originServerTs
                }
            }
            room.reactions[relatedEventId].sort((a, b) => {
                return a.ts < b.ts ? -1 : 1
            })
        }
    }

    // Process message replacement
    if (event.type === 'm.room.message' && event.content?.['m.relates_to']?.relType === 'm.replace') {
        const relatedEventId: string | undefined = event.content?.['m.relates_to']?.eventId
        if (relatedEventId) {
            const existingReplacementTimestamp = room.replacements[relatedEventId]?.originServerTs ?? 0
            if (event.originServerTs > existingReplacementTimestamp) {
                room.replacements[relatedEventId] = event
            }
        }
    }

    // Insert event into timeline
    if (timeline.length === 0) {
        timeline.push(event)
        return false
    }
    let low = 0
    let high = timeline.length
    while (low < high) {
        const mid = (low + high) >>> 1
        const midEvent = timeline[mid]
        if (midEvent == null) {
            low = high
            break
        }
        if (midEvent.originServerTs < event.originServerTs) {
            low = mid + 1
        } else if (midEvent.originServerTs > event.originServerTs) {
            high = mid
        } else {
            if (midEvent.eventId < event.eventId) {
                low = mid + 1
            } else {
                high = mid
            }
        }
    }
    if (timeline[low]?.eventId === event.eventId) return true
    timeline.splice(low, 0, event)
    return false
}

function getTimelineEventIndexById(
    timeline: ApiV3SyncClientEventWithoutRoomId[],
    eventId?: string
): number | undefined {
    if (eventId == null) return
    for (let eventIndex = timeline.length - 1; eventIndex >= 0; eventIndex--)  {
        if (timeline[eventIndex]?.eventId === eventId) {
            return eventIndex
        }
    }
}

function manageTimelineGap(room: JoinedRoom | LeftRoom, timeline: ApiV3SyncTimeline, nextBatch: string) {
    if (timeline.limited && room.timelineGapStartToken && room.timelineGapEndToken) {
        /* 
         * We already have a gap that has not been filled, don't want to maintain multiple gaps. Discard old events.
         *
         *      |---timeline1---|               |----timeline2----|
         *   endToken      gapEndtoken    gapStartToken       startToken
         *
         *                                      |----timeline2----|              |-------timeline3-------|
         *                                   endToken         gapEndtoken    gapStartToken           startToken
         */
        const visibleGapEndEventIndex = getTimelineEventIndexById(room.visibleTimeline, room.timelineGapNewestVisibleEventId)
        const invisibleGapEndEventIndex = getTimelineEventIndexById(room.invisibleTimeline, room.timelineGapNewestInvisibleEventId)
        if (visibleGapEndEventIndex != null || invisibleGapEndEventIndex != null) {
            room.visibleTimeline = visibleGapEndEventIndex != null ? room.visibleTimeline.slice(visibleGapEndEventIndex + 1) : room.visibleTimeline
            room.invisibleTimeline = invisibleGapEndEventIndex != null ? room.invisibleTimeline.slice(invisibleGapEndEventIndex + 1) : room.invisibleTimeline
            room.timelineEndToken = room.timelineGapStartToken
            room.timelineGapEndToken = room.timelineStartToken
            room.timelineGapStartToken = timeline.prevBatch
            room.timelineStartToken = nextBatch
        } else {
            // If we can't find where to slice the timeline, do a total reset.
            room.visibleTimeline = []
            room.invisibleTimeline = []
            room.timelineGapStartToken = undefined
            room.timelineGapEndToken = undefined
            room.timelineEndToken = timeline.prevBatch
            room.timelineStartToken = nextBatch
        }
        room.timelineGapNewestVisibleEventId = room.visibleTimeline[room.visibleTimeline.length - 1]?.eventId
        room.timelineGapNewestInvisibleEventId = room.invisibleTimeline[room.invisibleTimeline.length - 1]?.eventId
    } else if (timeline.limited && room.timelineEndToken) {
        /* 
         * We have a normal timeline, but a gap is being created. Future API calls will fill in the gap.
         * 
         *      |---timeline1---|
         *   endToken       startToken
         * 
         *      |---timeline1---|             |---timeline2---|
         *   endToken      gapEndToken   gapStartToken    startToken
         */
        room.timelineGapEndToken = room.timelineStartToken
        room.timelineGapStartToken = timeline.prevBatch
        room.timelineStartToken = nextBatch
        room.timelineGapNewestVisibleEventId = room.visibleTimeline[room.visibleTimeline.length - 1]?.eventId
        room.timelineGapNewestInvisibleEventId = room.invisibleTimeline[room.invisibleTimeline.length - 1]?.eventId
    } else {
        /*
         * No gap and not creating a gap. Only take prevBatch token if we don't already have an older one.
         *
         *       |---timeline1---| 
         *    endToken       startToken
         * 
         *       |---timeline1---|---timeline2---|
         *    endToken                       startToken
         */
        if (!room.timelineEndToken) {
            room.timelineEndToken = timeline.prevBatch
        }
        room.timelineStartToken = nextBatch
    }
}

function addAccountDataEvent(room: JoinedRoom | LeftRoom, event: ApiV3SyncAccountDataEvent) {
    const eventContentParse = eventContentSchemaByType[event.type as keyof typeof eventContentSchemaByType]?.safeParse(event.content)
    if (!eventContentParse?.success) return
    room.accountData[event.type] = event.content
}

function populateEphemeralRoomEvents(room: JoinedRoom, events: Array<{ content: any; type: string; }>) {
    for (const event of events) {
        if (event.type === 'm.receipt') {
            const eventContentParse = eventContentSchemaByType['m.receipt']?.safeParse(event.content)
            if (!eventContentParse?.success) continue
            for (const eventId in eventContentParse.data) {
                const mRead = eventContentParse.data[eventId]?.['m.read'] ?? {}
                for (const userId in mRead) {
                    room.readRecepts[userId] = {
                        eventId,
                        ts: mRead[userId]?.ts,
                        threadId: mRead[userId]?.threadId,
                    }
                }
            }
        } else if (event.type === 'm.typing') {
            const eventContentParse = eventContentSchemaByType['m.typing']?.safeParse(event.content)
            if (!eventContentParse?.success) continue
            room.typingUserIds = eventContentParse.data.userIds
        }
    }
}

export const useRoomStore = defineStore('room', () => {
    const { isLeader } = useBroadcast()
    const { userId: currentUserId } = storeToRefs(useSessionStore())

    const roomsLoading = ref<boolean>(true)
    const roomsLoadError = ref<Error | null>(null)

    const invited = ref<Record<string, InvitedRoom>>({})
    const knocked = ref<Record<string, KnockedRoom>>({})
    const joined = ref<Record<string, JoinedRoom>>({})
    const left = ref<Record<string, LeftRoom>>({})
    const decryptedRoomEvents = ref<Record<string, ApiV3SyncClientEventWithoutRoomId>>({})

    async function initialize() {
        try {
            await Promise.all([
                loadDiscortixTableKey('rooms', 'invited').then((invitedRooms) => {
                    if (!invitedRooms) return
                    invited.value = invitedRooms
                }),
                loadDiscortixTableKey('rooms', 'knocked').then((knockedRooms) => {
                    if (!knockedRooms) return
                    knocked.value = knockedRooms
                }),
                loadDiscortixTableKey('rooms', 'joined').then((joinedRooms) => {
                    if (!joinedRooms) return
                    joined.value = joinedRooms
                }),
                loadDiscortixTableKey('rooms', 'left').then((leftRooms) => {
                    if (!leftRooms) return
                    left.value = leftRooms
                }),
            ])
        } catch (error) {
            if (error instanceof Error) {
                roomsLoadError.value = error
            } else {
                roomsLoadError.value = new Error('The thrown object was not an error.')
            }
        }
        roomsLoading.value = false
    }
    initialize()

    async function populateFromApiV3SyncResponse(sync: ApiV3SyncResponse) {
        if (!sync.rooms) return

        let touchedRoomTypes: Set<'invited' | 'knocked' | 'joined' | 'left'> = new Set()

        // Populate invited room state
        if (sync.rooms.invite) {
            touchedRoomTypes.add('invited')
            for (const roomId in sync.rooms.invite) {
                const invitedRoomsSync = sync.rooms.invite[roomId]
                if (!invitedRoomsSync) continue

                if (!invited.value[roomId]) {
                    invited.value[roomId] = {
                        roomId,
                        stateEventsByType: {},
                    }
                }

                if (knocked.value[roomId]) {
                    delete knocked.value[roomId]
                    touchedRoomTypes.add('knocked')
                }
                if (joined.value[roomId]) {
                    delete joined.value[roomId]
                    touchedRoomTypes.add('joined')
                }
                if (left.value[roomId]) {
                    delete left.value[roomId]
                    touchedRoomTypes.add('left')
                }

                if (invitedRoomsSync.inviteState?.events) {
                    for (const stateEvent of invitedRoomsSync.inviteState.events) {
                        addInvitedRoomStateEvent(invited.value[roomId], stateEvent)
                    }
                }
            }
        }

        // Populate knocked room state
        if (sync.rooms.knock) {
            touchedRoomTypes.add('knocked')
            for (const roomId in sync.rooms.knock) {
                const knockedRoomsSync = sync.rooms.knock[roomId]
                if (!knockedRoomsSync) continue

                if (!knocked.value[roomId]) {
                    knocked.value[roomId] = {
                        roomId,
                        stateEventsByType: {},
                    }
                }

                if (invited.value[roomId]) {
                    delete invited.value[roomId]
                    touchedRoomTypes.add('invited')
                }
                if (joined.value[roomId]) {
                    delete joined.value[roomId]
                    touchedRoomTypes.add('joined')
                }
                if (left.value[roomId]) {
                    delete left.value[roomId]
                    touchedRoomTypes.add('left')
                }

                if (knockedRoomsSync.knockState?.events) {
                    for (const stateEvent of knockedRoomsSync.knockState.events) {
                        addKnockedRoomStateEvent(knocked.value[roomId], stateEvent)
                    }
                }
            }
        }

        // Populate joined room state
        if (sync.rooms.join) {
            touchedRoomTypes.add('joined')
            for (const roomId in sync.rooms.join) {
                const joinedRoomSync = sync.rooms.join[roomId]
                if (!joinedRoomSync) continue

                if (!joined.value[roomId]) {
                    joined.value[roomId] = {
                        roomId,
                        accountData: left.value[roomId]?.accountData ?? {},
                        reactions: {},
                        readRecepts: {},
                        redactions: [],
                        replacements: {},
                        stateEventsByType: {},
                        stateEventsById: {},
                        summary: {},
                        visibleTimeline: [],
                        invisibleTimeline: [],
                        typingUserIds: [],
                        unreadNotifications: { highlightCount: 0, notificationCount: 0 },
                        unreadThreadNotifications: {},
                    }
                }

                if (invited.value[roomId]) {
                    delete invited.value[roomId]
                    touchedRoomTypes.add('invited')
                }
                if (knocked.value[roomId]) {
                    delete knocked.value[roomId]
                    touchedRoomTypes.add('knocked')
                }
                if (left.value[roomId]) {
                    delete left.value[roomId]
                    touchedRoomTypes.add('left')
                }

                if (joinedRoomSync.accountData?.events) {
                    for (const accountDataEvent of joinedRoomSync.accountData.events) {
                        addAccountDataEvent(joined.value[roomId], accountDataEvent)
                    }
                }
                if (joinedRoomSync.ephemeral?.events) {
                    populateEphemeralRoomEvents(joined.value[roomId], joinedRoomSync.ephemeral.events)
                }
                if (joinedRoomSync.state?.events) {
                    for (const stateEvent of joinedRoomSync.state.events) {
                        addJoinedOrLeftRoomStateEvent(joined.value[roomId], stateEvent)
                    }
                }
                if (joinedRoomSync.summary) {
                    joined.value[roomId].summary = joinedRoomSync.summary
                }
                if (joinedRoomSync.timeline) {
                    manageTimelineGap(joined.value[roomId], joinedRoomSync.timeline, sync.nextBatch)
                    if (joinedRoomSync.timeline.events) {
                        for (const timelineEvent of joinedRoomSync.timeline.events) {
                            if (isRoomStateEventType(timelineEvent.type)) {
                                addJoinedOrLeftRoomStateEvent(joined.value[roomId], timelineEvent)
                            }
                            addJoinedOrLeftRoomTimelineEvent(joined.value[roomId], timelineEvent)
                        }
                    }
                }
                if (joinedRoomSync.unreadNotifications) {
                    joined.value[roomId].unreadNotifications.highlightCount = joinedRoomSync.unreadNotifications.highlightCount ?? 0
                    joined.value[roomId].unreadNotifications.notificationCount = joinedRoomSync.unreadNotifications.notificationCount ?? 0
                }
                if (joinedRoomSync.unreadThreadNotifications) {
                    for (const threadId in joinedRoomSync.unreadThreadNotifications) {
                        if (!joined.value[roomId].unreadThreadNotifications[threadId]) {
                            joined.value[roomId].unreadThreadNotifications[threadId] = {
                                highlightCount: 0,
                                notificationCount: 0,
                            }
                        }
                        joined.value[roomId].unreadThreadNotifications[threadId].highlightCount = joinedRoomSync.unreadThreadNotifications[threadId]?.highlightCount ?? 0
                        joined.value[roomId].unreadThreadNotifications[threadId].notificationCount = joinedRoomSync.unreadThreadNotifications[threadId]?.notificationCount ?? 0
                    }
                }
            }
        }

        // Populate left room state
        if (sync.rooms.leave) {
            touchedRoomTypes.add('left')
            const leftRooms: Record<string, ApiV3SyncLeftRoom> = sync.rooms.leave ?? {}
            for (const roomId in leftRooms) {
                const leftRoomSync = leftRooms[roomId]
                if (!leftRoomSync) continue

                if (!left.value[roomId]) {
                    left.value[roomId] = {
                        roomId,
                        accountData: joined.value[roomId]?.accountData ?? {},
                        reactions: {},
                        redactions: [],
                        replacements: {},
                        stateEventsByType: {},
                        stateEventsById: {},
                        visibleTimeline: [],
                        invisibleTimeline: [],
                    }
                }

                if (invited.value[roomId]) {
                    delete invited.value[roomId]
                    touchedRoomTypes.add('invited')
                }
                if (knocked.value[roomId]) {
                    delete knocked.value[roomId]
                    touchedRoomTypes.add('knocked')
                }
                if (joined.value[roomId]) {
                    delete joined.value[roomId]
                    touchedRoomTypes.add('joined')
                }

                if (leftRoomSync.accountData?.events) {
                    for (const accountDataEvent of leftRoomSync.accountData.events) {
                        addAccountDataEvent(left.value[roomId], accountDataEvent)
                    }
                }
                if (leftRoomSync.state?.events) {
                    for (const stateEvent of leftRoomSync.state.events) {
                        addJoinedOrLeftRoomStateEvent(left.value[roomId], stateEvent)
                    }
                }
                if (leftRoomSync.timeline) {
                    manageTimelineGap(left.value[roomId], leftRoomSync.timeline, sync.nextBatch)
                    if (leftRoomSync.timeline.events) {
                        for (const timelineEvent of leftRoomSync.timeline.events) {
                            if (isRoomStateEventType(timelineEvent.type)) {
                                addJoinedOrLeftRoomStateEvent(left.value[roomId], timelineEvent)
                            }
                            addJoinedOrLeftRoomTimelineEvent(left.value[roomId], timelineEvent)
                        }
                    }
                }
            }
        }

        if (isLeader.value) {
            if (touchedRoomTypes.has('invited')) {
                try {
                    await saveDiscortixTableKey('rooms', 'invited', toRaw(invited.value))
                } catch (error) {
                    localStorage.setItem('mx_full_sync_required', 'true')
                }
            }
            if (touchedRoomTypes.has('knocked')) {
                try {
                    await saveDiscortixTableKey('rooms', 'knocked', toRaw(knocked.value))
                } catch (error) {
                    localStorage.setItem('mx_full_sync_required', 'true')
                }
            }
            if (touchedRoomTypes.has('joined')) {
                try {
                    await saveDiscortixTableKey('rooms', 'joined', toRaw(joined.value))
                } catch (error) {
                    localStorage.setItem('mx_full_sync_required', 'true')
                }
            }
            if (touchedRoomTypes.has('left')) {
                try {
                    await saveDiscortixTableKey('rooms', 'left', toRaw(left.value))
                } catch (error) {
                    localStorage.setItem('mx_full_sync_required', 'true')
                }
            }
        }

    }

    async function populateFromApiV3RoomMessagesResponse(roomId: string, messages: ApiV3RoomMessagesResponse) {
        const joinedRoom = joined.value[roomId]
        const leftRoom = left.value[roomId]
        const room = joinedRoom ?? leftRoom
        if (!room) return

        let duplicateEncounteredCount = 0

        for (const timelineEvent of messages.chunk) {
            duplicateEncounteredCount += addJoinedOrLeftRoomTimelineEvent(room, timelineEvent) ? 1 : 0
            if (duplicateEncounteredCount > 3) break
        }

        if (room.timelineGapStartToken && room.timelineGapEndToken) {
            if (messages.end) {
                if (duplicateEncounteredCount > 3) {
                    delete room.timelineGapStartToken
                    delete room.timelineGapEndToken
                    room.timelineEndToken = messages.end
                } else {
                    room.timelineGapStartToken = messages.end
                }
            } else {
                delete room.timelineGapStartToken
                delete room.timelineGapEndToken
            }
        } else {
            room.timelineEndToken = messages.end
        }

        // Different browser tabs can fetch different room histories, and only the leader's history is kept.
        // This means if the leader swaps to a different tab, chat messages from the previous leader can
        // be lost in storage because the new leader doesn't have them. But we're treating message fetching
        // as semi-ephemeral state anyways. They can always be fetched again.
        if (isLeader.value) {
            if (joinedRoom) {
                try {
                    await saveDiscortixTableKey('rooms', 'joined', toRaw(joined.value))
                } catch (error) {
                    // Ignore - It is not critical that message history is updated. Can fetch again.
                }
            } else if (leftRoom) {
                try {
                    await saveDiscortixTableKey('rooms', 'left', toRaw(left.value))
                } catch (error) {
                    // Ignore - It is not critical that message history is updated. Can fetch again.
                }
            }
        }
    }

    // This includes one-on-one and group chats.
    const directMessageRooms = computed(() => {
        const rooms: RoomSummary[] = []
        for (const roomId in joined.value) {
            const room = joined.value[roomId]
            if (!room) continue
            const roomAvatarEvent = room.stateEventsByType['m.room.avatar']?.[0]
            const roomCreateEvent = room.stateEventsByType['m.room.create']?.[0]
            const roomNameEvent = room.stateEventsByType['m.room.name']?.[0]
            const roomMemberEvents = room.stateEventsByType['m.room.member'] ?? []
            const spaceParentEvent = room.stateEventsByType['m.space.parent']?.[0]

            if (!roomCreateEvent) continue
            if (roomCreateEvent?.content?.type === 'm.space') continue
            if (spaceParentEvent) continue
            const roomVersion = roomCreateEvent.content.roomVersion ?? '1'

            let heroes: string[] = (room.summary?.['m.heroes'] ?? []).filter((userId) => userId !== currentUserId.value)
            let joinedMemberCount = room.summary?.['m.joined_member_count']
            if (heroes.length === 0 || !joinedMemberCount) {
                const memberEvents = roomMemberEvents.filter(
                    (event) => event.stateKey && (event.content.membership === 'join' || event.content.membership === 'invite')
                )
                if (heroes.length === 0) {
                    heroes = memberEvents.filter((event) => event.stateKey !== currentUserId.value).map((event) => event.stateKey ?? '')
                }
                if (!joinedMemberCount) {
                    joinedMemberCount = memberEvents.filter(
                        (event) => event.content.membership === 'join'
                    ).length
                }
            }

            rooms.push({
                avatarUrl: roomAvatarEvent?.content?.info?.thumbnailUrl ?? roomAvatarEvent?.content?.url,
                creator: (
                    parseInt(roomVersion) >= 11
                        ? roomCreateEvent.sender
                        : roomCreateEvent.content.creator
                ) ?? '',
                heroes,
                roomId,
                joinedMemberCount,
                name: roomNameEvent?.content.name ?? '',
                roomVersion,
            })
        }
        return rooms
    })

    return {
        roomsLoading,
        roomsLoadError,
        invited: computed(() => invited.value),
        knocked: computed(() => knocked.value),
        joined: computed(() => joined.value),
        left: computed(() => left.value),
        decryptedRoomEvents,
        directMessageRooms,
        getTimelineEventIndexById,
        populateFromApiV3SyncResponse,
        populateFromApiV3RoomMessagesResponse,
    }
})