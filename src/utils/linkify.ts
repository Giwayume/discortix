import {
    registerPlugin, State, createTokenClass, find,
    type ScannerInit, type ParserInit,
} from 'linkifyjs'
import { useSessionStore } from '@/stores/session'

const makeState = (arg?: any) => new State(arg)

const MatrixUserToken = createTokenClass('matrixUser', {
    isLink: true,
    toHref() {
        return `https://matrix.to/#/${(this as any).v}`;
    },
});

export function matrixUserPlugin({ scanner, parser }: { scanner: ScannerInit, parser: ParserInit }) {
    const { HYPHEN, COLON, DOT } = scanner.tokens
    const { domain } = scanner.tokens.groups

    const usernameRegex = /[a-zA-Z0-9\-.=_\/]/
    let mentionState = scanner.start.tt('@')
    for (let i = 0; i < 250; i++) {
        mentionState = mentionState.tr(usernameRegex, 'MENTION')
    }

    const MatrixUser = new State(MatrixUserToken)

    const Mention = parser.start.tt('MENTION')
    const Colon = Mention.tt(COLON)
    
    Colon.ta(domain!, MatrixUser as never)
    const MatrixUserHyphen = MatrixUser.tt(HYPHEN)
    MatrixUserHyphen.ta(domain!, MatrixUser)
    const MatrixUserDot = MatrixUser.tt(DOT)
    MatrixUserDot.ta(domain!, MatrixUser)
}
registerPlugin('matrixUser', matrixUserPlugin);

const MatrixMxcUriToken = createTokenClass('matrixMxcUri', {
    isLink: true,
    toHref() {
        const { homeserverBaseUrl } = useSessionStore()
        const [mediaHomeserver, mediaId] = `${(this as any).v}`.replace('mxc://', '').split('/')
        return `${homeserverBaseUrl}/_matrix/media/v3/download/${mediaHomeserver}/${mediaId}?allow_redirect=true`
    },
})

export function matrixMxcUriPlugin({ scanner, parser }: { scanner: ScannerInit, parser: ParserInit }) {
    const { SLASH, HYPHEN, UNDERSCORE, DOT } = scanner.tokens
    const { domain } = scanner.tokens.groups

    scanner.start.tt('m').tt('x').tt('c').tt(':').tt('/').tt('/', 'MXCPROTOCOL')

    const MatrixMxcUri = new State(MatrixMxcUriToken)

    const MxcProtocol = parser.start.tt('MXCPROTOCOL')

    const LocationPart = makeState()

    MxcProtocol.ta(domain!, LocationPart)
    const LocationPartHyphen = LocationPart.tt(HYPHEN)
    LocationPartHyphen.ta(domain!, LocationPart)
    const LocationPartDot = LocationPart.tt(DOT)
    LocationPartDot.ta(domain!, LocationPart)

    const Slash = LocationPart.tt(SLASH)
    Slash.ta(domain!, MatrixMxcUri)
    Slash.ta([HYPHEN], MatrixMxcUri)
    Slash.ta([UNDERSCORE], MatrixMxcUri)
    MatrixMxcUri.ta(domain!, MatrixMxcUri)
    MatrixMxcUri.ta([HYPHEN], MatrixMxcUri)
    MatrixMxcUri.ta([UNDERSCORE], MatrixMxcUri)

}
registerPlugin('matrixMxcUri', matrixMxcUriPlugin);

const dummyExport = undefined
export default dummyExport