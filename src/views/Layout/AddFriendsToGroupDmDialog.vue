<template>
    <Dialog
        id="new-message-dialog"
        :visible="visible"
        modal
        :header="t('addFriendsToGroupDmDialog.title')"
        :style="{ width: 'calc(100% - 1rem)', maxWidth: '30rem', height: 'calc(100dvh - 6rem)', minHeight: '27rem' }"
        :pt="{
            content: { class: 'flex flex-col' },
            footer: { class: 'border-t border-(--border-subtle)' }
        }"
        @update:visible="(visible) => emit('update:visible', visible)"
    >
        <p :class="{ 'text-subtle': remainingSelectionCount > 0, 'text-feedback-critical': remainingSelectionCount === 0 }">{{ t('addFriendsToGroupDmDialog.addCountLimit', { count: remainingSelectionCount }) }}</p>
        <div class="flex gap-2 mt-6 mb-3">
            <div class="p-inputtext grow-1 flex flex-wrap items-center w-full !px-1 !py-1 !gap-1">
                <Chip
                    v-for="userId of selectedUserIds"
                    :key="userId"
                    :label="profiles[userId]?.displayname ?? userId"
                    removable
                    class="h-9"
                    @remove="removeSelectedUser(userId)"
                >
                    <template #removeicon="{ removeCallback, keydownCallback }">
                        <i class="p-chip-remove-icon pi pi-times ml-1" aria-hidden="true" @click="removeCallback" @keydown="keydownCallback" />
                    </template>
                </Chip>
                <InputText
                    v-model.trim="userSearchText"
                    class="p-inputtext-transparent w-32 grow-1 !py-2"
                    :placeholder="selectedUserIds.length === 0 ? t('addFriendsToGroupDmDialog.searchPlaceholder') : ''"
                    @keydown="onKeydownUserSearch"
                    @input="onInputUserSearch"
                />
            </div>
            <Button
                class="shrink-0 min-w-20 h-12"
                :loading="isInvitingPeople" severity="primary"
                @click="inviteConfirm()"
            >
                <div class="p-button-label">{{ t('addFriendsToGroupDmDialog.addButton') }}</div>
                <div class="p-button-loading-dots" />
            </Button>
        </div>
        <ScrollPanel>
            <label
                v-for="(user, userIndex) of filteredContactList"
                :key="user.userId"
                class="user-checkbox-list__item"
                :class="{ 'user-checkbox-list__item--selected': userSearchSelectionIndex === userIndex }"
            >
                <OverlayStatus level="high" :status="user.presence" class="w-8 h-8">
                    <AuthenticatedImage :mxcUri="user.avatarUrl" type="thumbnail" :width="48" :height="48" method="scale">
                        <template v-slot="{ src }">
                            <Avatar :image="src" shape="circle" size="large" :aria-label="t('layout.userAvatarImage')" />
                        </template>
                        <template #error>
                            <Avatar icon="pi pi-user" shape="circle" size="large" :aria-label="t('layout.userAvatarImage')" />
                        </template>
                    </AuthenticatedImage>
                </OverlayStatus>
                <div class="flex flex-col grow-1">
                    <strong class="text-strong text-medium">{{ user.displayname ?? user.userId }}</strong>
                    <span class="text-xs text-muted">{{ user.userId }}</span>
                </div>
                <Checkbox
                    v-model="selectedUserIds"
                    :value="user.userId"
                    :disabled="!selectedUserIds.includes(user.userId) && remainingSelectionCount === 0"
                />
            </label>
            <div v-if="isSearchingForMoreUsers" class="mx-2 my-4 text-muted text-sm text-center">
                {{ t('addFriendsToGroupDmDialog.searchingDirectory') }}
            </div>
            <div
                v-else-if="filteredContactList.length === 0"
                v-html="micromark(t('addFriendsToGroupDmDialog.noUsersFound', { defaultUserIdHomeserver }))"
                class="mx-10 my-4 text-muted text-sm text-center" />
            <div
                v-else-if="userSearchText"
                v-html="micromark(t('addFriendsToGroupDmDialog.someUsersFound', { defaultUserIdHomeserver }))"
                class="mx-10 mt-8 mb-4 text-muted text-sm text-center" />
        </ScrollPanel>
    </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { micromark } from 'micromark'

import { HttpError } from '@/utils/error'

import { useApplication } from '@/composables/application'
import { createLogger } from '@/composables/logger'
import { useMegolm } from '@/composables/megolm'
import { useProfiles } from '@/composables/profiles'
import { useRooms } from '@/composables/rooms'

import { useProfileStore } from '@/stores/profile'
import { useRoomStore } from '@/stores/room'
import { useSessionStore } from '@/stores/session'

import AuthenticatedImage from '@/views/Common/AuthenticatedImage.vue'
import OverlayStatus from '@/views/Common/OverlayStatus.vue'

import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Chip from 'primevue/chip'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import ScrollPanel from 'primevue/scrollpanel'
import { useToast } from 'primevue/usetoast'

import { type UserProfile } from '@/types'

const log = createLogger(import.meta.url)

const { t } = useI18n()
const toast = useToast()

const { toggleApplicationSidebar } = useApplication()
const { sendRoomKeysToUsers } = useMegolm()
const { getProfile, searchUserDirectory } = useProfiles()
const { inviteToRoom } = useRooms()

const { profiles } = storeToRefs(useProfileStore())
const { draft: draftRoom, joined: joinedRooms } = storeToRefs(useRoomStore())
const { userId: sessionUserId, defaultUserIdHomeserver } = storeToRefs(useSessionStore())

const props = defineProps({
    visible: {
        type: Boolean,
        default: false,
    },
    roomId: {
        type: String,
        default: undefined,
    },
})

const emit = defineEmits<{
    (e: 'update:visible', visible: boolean): void
}>()

const userSearchText = ref<string>('')
const userSearchSelectionIndex = ref<number>(-1)
const selectedUserIds = ref<string[]>([])
const orderedContactList = ref<UserProfile[]>([])

const isSearchingForMoreUsers = ref<boolean>(false)
const isInvitingPeople = ref<boolean>(false)

const remainingSelectionCount = computed(() => {
    return Math.max(0, 9 - selectedUserIds.value.length)
})

const filteredContactList = computed(() => {
    const preparedSearchTerms = userSearchText.value.toLowerCase().trim().split(/\s+/).map((searchTerm) => {
        return {
            searchTerm,
            searchTermIsFullId: searchTerm.includes(':'),
            usernameOnlyTerm: searchTerm.replace(/^@/, ''),
        }
    })
    return orderedContactList.value.filter((contact) => {
        let allSearchTermsFound = true
        for (const { searchTerm, searchTermIsFullId, usernameOnlyTerm } of preparedSearchTerms) {
            if (!(
                contact.displayname?.toLowerCase().includes(searchTerm)
                || (!searchTermIsFullId && contact.userId.split(':')[0]?.slice(1).includes(usernameOnlyTerm))
                || (searchTermIsFullId && contact.userId.includes(searchTerm))
            )) {
                allSearchTermsFound = false
                break
            }
        }
        return allSearchTermsFound
    })
})

function populateContactList() {
    const contacts: UserProfile[] = []
    for (const userId in profiles.value) {
        if (userId === sessionUserId.value) continue
        if (profiles.value[userId]) {
            contacts.push(profiles.value[userId])
        }
    }
    contacts.sort((a, b) => {
        if (a.currentlyActive && !b.currentlyActive) return -1
        else if (b.currentlyActive && !a.currentlyActive) return 1
        return 0
    })
    orderedContactList.value = contacts
}

function onKeydownUserSearch(event: KeyboardEvent) {
    if (event.key === 'Backspace') {
        if (userSearchText.value.trim() === '') {
            event.preventDefault()
            selectedUserIds.value.pop()
        }
    } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        userSearchSelectionIndex.value++
        if (userSearchSelectionIndex.value >= filteredContactList.value.length) {
            userSearchSelectionIndex.value = 0
        }
    } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        userSearchSelectionIndex.value--
        if (userSearchSelectionIndex.value < 0) {
            userSearchSelectionIndex.value =  filteredContactList.value.length - 1
        }
    } else if (event.key === 'Enter') {
        event.preventDefault()
        const person = filteredContactList.value[Math.max(0, Math.min(filteredContactList.value.length - 1, userSearchSelectionIndex.value))]!
        if (selectedUserIds.value.includes(person.userId)) {
            const userIdIndex = selectedUserIds.value.indexOf(person.userId)
            selectedUserIds.value.splice(userIdIndex, 1)
        } else {
            selectedUserIds.value.push(person.userId)
            currentlyRunningUserDirectorySearchTerm = ''
            userSearchText.value = ''
        }
    }
}

watch(() => userSearchText.value, (newText, oldText) => {
    if (newText !== oldText) {
        if (newText.trim() !== '') {
            userSearchSelectionIndex.value = 0
        } else {
            userSearchSelectionIndex.value = -1
        }
    }
})

watch(() => selectedUserIds.value, (newSelection, oldSelection) => {
    if (newSelection.length > oldSelection.length) {
        currentlyRunningUserDirectorySearchTerm = ''
        userSearchText.value = ''
    }
})

let currentlyRunningUserDirectorySearchTerm = ''
let userDirectorySearchTimeoutHandle: number | undefined = undefined
let userDirectorySearchAbortController: AbortController | undefined = undefined
async function runDirectorySearch() {
    userDirectorySearchAbortController?.abort()
    userDirectorySearchAbortController = new AbortController()

    try {
        const userSearchTrim = userSearchText.value.trim()
        const isExactUserSearch = userSearchTrim.includes(':')
        const userIdSearch = isExactUserSearch && !userSearchTrim.includes(' ')
            ? `@${userSearchTrim.replace(/^@/, '')}`
            : `@${userSearchTrim.replace(/^@/, '')}:${defaultUserIdHomeserver.value}`
        try {
            if (orderedContactList.value.findIndex((user) => user.userId === userIdSearch) === -1) {
                const profile = await getProfile(userIdSearch, userDirectorySearchAbortController)
                userDirectorySearchAbortController.abort()

                if (orderedContactList.value.findIndex((user) => user.userId === userIdSearch) === -1) {
                    orderedContactList.value.push({
                        userId: userIdSearch,
                        avatarUrl: profile.avatarUrl,
                        currentlyActive: false,
                        displayname: profile.displayname,
                        presence: 'offline',
                    })
                }
            }
            if (isExactUserSearch) {
                throw new DOMException('Aborting directory search because a profile was found.', 'AbortError')
            }
        } catch (error) {
            // Profile not found - ignore.
        }

        if (userDirectorySearchAbortController.signal.aborted) {
            throw new DOMException('Not starting directory search because signal was aborted.', 'AbortError')
        }
        const results = await searchUserDirectory(userSearchTrim, userDirectorySearchAbortController)
        for (const result of results.results) {
            if (orderedContactList.value.findIndex((user) => user.userId === result.userId) !== -1) continue
            orderedContactList.value.push({
                userId: result.userId,
                avatarUrl: result.avatarUrl,
                currentlyActive: false,
                displayname: result.displayName,
                presence: 'offline',
            })
        }
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            // Ignore aborted request.
        }
    } finally {
        isSearchingForMoreUsers.value = false
    }
}

function onInputUserSearch() {
    if (userSearchText.value === '') {
        currentlyRunningUserDirectorySearchTerm = ''
        isSearchingForMoreUsers.value = false
        clearTimeout(userDirectorySearchTimeoutHandle)
        userDirectorySearchAbortController?.abort()
    } else if (currentlyRunningUserDirectorySearchTerm !== userSearchText.value) {
        currentlyRunningUserDirectorySearchTerm = userSearchText.value
        isSearchingForMoreUsers.value = true
        clearTimeout(userDirectorySearchTimeoutHandle)
        userDirectorySearchAbortController?.abort()
        userDirectorySearchTimeoutHandle = setTimeout(() => {
            runDirectorySearch()
        }, 1500)
    }
}

function removeSelectedUser(userId: string) {
    const selectedUserIndex = selectedUserIds.value.indexOf(userId)
    if (selectedUserIndex > -1) {
        selectedUserIds.value.splice(selectedUserIndex, 1)
    }
}

async function inviteConfirm() {
    if (!props.roomId) return
    const room = joinedRooms.value[props.roomId]
    if (!room) return

    const alreadyInvitedOrJoinedIds = room.stateEventsByType['m.room.member']?.filter((event) => {
        return event.content?.membership === 'join' || event.content?.membership === 'invite'
    }).map((event) => {
        return event.content?.membership === 'join' ? event.sender : event.stateKey
    }) ?? []

    const uniqueSelectedUserIds = Array.from(new Set<string>(selectedUserIds.value))
        .filter((userId) => !alreadyInvitedOrJoinedIds.includes(userId))

    if (uniqueSelectedUserIds.length > 0) {
        isInvitingPeople.value = true
        try {
            const inviteResult = await inviteToRoom(props.roomId, uniqueSelectedUserIds)
            let hasShownErrorMessage = false
            let erroredUserIds: string[] = []
            for (const [settledIndex, settled] of inviteResult.entries()) {
                const erroredUserId = uniqueSelectedUserIds[settledIndex]
                if (settled.status === 'rejected') {
                    if (!hasShownErrorMessage) {
                        hasShownErrorMessage = true
                        if (settled.reason instanceof HttpError) {
                            if (settled.reason.isMatrixInviteBlocked()) {
                                toast.add({ severity: 'error', summary: t('errors.inviteToRoom.inviteBlocked', {
                                    userId: erroredUserId,
                                }), life: 5000 })
                            } if (settled.reason.isMatrixForbidden()) {
                                toast.add({ severity: 'error', summary: t('errors.inviteToRoom.inviteForbidden', {
                                    userId: erroredUserId,
                                    reason: settled.reason.matrixReason(),
                                }), life: 8000 })
                            } else if (settled.reason.isMatrixUnsupportedRoomVersion()) {
                                toast.add({ severity: 'error', summary: t('errors.inviteToRoom.unsupportedRoomVersion'), life: 16000 })
                            } else {
                                log.error('Unknown error when sending invite: ', settled.reason)
                                toast.add({ severity: 'error', summary: t('errors.inviteToRoom.unknown'), life: 5000 })
                            }
                        } else {
                            log.error('Unknown error when sending invite: ', settled.reason)
                            toast.add({ severity: 'error', summary: t('errors.inviteToRoom.unknown'), life: 5000 })
                        }
                    }
                    if (erroredUserId) {
                        erroredUserIds.push(erroredUserId)
                    }
                }
            }

            if (room.stateEventsByType['m.room.encryption']?.[0]) {
                sendRoomKeysToUsers(
                    props.roomId,
                    uniqueSelectedUserIds.filter((userId) => !erroredUserIds.includes(userId))
                )
            }
        } finally {
            isInvitingPeople.value = false
        }
    }

    emit('update:visible', false)
    toggleApplicationSidebar(false)
}

watch(() => props.visible, (visible, wasVisible) => {
    if (visible && !wasVisible) {
        isInvitingPeople.value = false
        currentlyRunningUserDirectorySearchTerm = ''
        userSearchText.value = ''
        selectedUserIds.value = []
        populateContactList()
    } else if (!visible && wasVisible) {
        clearTimeout(userDirectorySearchTimeoutHandle)
        userDirectorySearchAbortController?.abort()
    }
}, { immediate: true })

</script>

<style lang="scss" scoped>
.p-scrollpanel {
    flex-grow: 1;
    flex-shrink: 1;
    margin: 0 -0.5rem;
    overflow: hidden;

    :deep(p) {
        margin: 1rem 0;

        &:first-child {
            margin-top: 0;
        }
        &:last-child {
            margin-bottom: 0;
        }
    }
}

.user-checkbox-list__item {
    display: flex;
    align-items: center;
    border-radius: var(--radius-sm);
    padding: 0.5rem;
    font-size: 0.875rem;
    gap: 0.5rem;
    height: 3rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;

    &:hover {
        background: hsl(var(--neutral-50-hsl)/.3);
    }

    &.user-checkbox-list__item--selected {
        background: hsl(var(--neutral-50-hsl)/.3);
    }
}
</style>