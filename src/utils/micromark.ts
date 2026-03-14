import { parse, preprocess, postprocess } from 'micromark'

import type {
    Code,
    Extension,
    Effects,
    HtmlExtension,
    State,
    Tokenizer
} from 'micromark-util-types'

declare module 'micromark-util-types' {
    interface TokenTypeMap {
        spoiler: 'spoiler'
        spoilerMarker: 'spoilerMarker'
        spoilerText: 'spoilerText'
    }
}

const SPOILER_MARK = 124

export function spoilerSyntax(): Extension {
    return {
        text: {
            [SPOILER_MARK]: {
                tokenize: tokenizeSpoiler,
                partial: true,
            },
        },
    }
}

const tokenizeSpoiler: Tokenizer = function (effects, ok, nok) {
    const ctx = { effects, ok, nok }
    return start.bind(ctx)
}

interface SpoilerContext {
    effects: Effects;
    ok: State;
    nok: State;
}

function start(this: SpoilerContext, code: Code): State {
    if (code !== SPOILER_MARK) return this.nok(code)!

    this.effects.enter('spoiler')
    this.effects.enter('spoilerMarker')
    this.effects.consume(code)

    return open.bind(this)
}

function open(this: SpoilerContext, code: Code): State {
    if (code !== SPOILER_MARK) return this.nok(code)!

    this.effects.consume(code)
    this.effects.exit('spoilerMarker')

    this.effects.enter('spoilerText', { contentType: 'text' })
    return inside.bind(this)
}

function inside(this: SpoilerContext, code: Code): State {
    if (code === SPOILER_MARK) {
        this.effects.exit('spoilerText')
        this.effects.enter('spoilerMarker')
        this.effects.consume(code)
        return close.bind(this)
    }

    this.effects.consume(code)
    return inside.bind(this)
}

function close(this: SpoilerContext, code: Code): State {
    if (code !== SPOILER_MARK) return this.nok(code)!

    this.effects.consume(code)
    this.effects.exit('spoilerMarker')
    this.effects.exit('spoiler')

    return this.ok
}

export function spoilerHtml(): HtmlExtension {
    return {
        enter: {
            spoiler() {
                this.tag('<span data-mx-spoiler>')
            },
        },
        exit: {
            spoiler() {
                this.tag('</span>')
            },
        }
    }
}

export function replaceSpoilers(md: string, replacement: string): string {
    const parser = parse({ extensions: [spoilerSyntax()] })

    const chunks = preprocess()(md, "utf8", true)
    const tokenizer = parser.document()
    const events = postprocess(tokenizer.write(chunks))

    let result = ''
    let cursor = 0

    for (const [type, token] of events) {
        if (type === 'enter' && token.type === 'spoiler') {
            const start = token.start.offset
            const end = token.end.offset

            result += md.slice(cursor, start)
            result += '||' + replacement + '||'

            cursor = end
        }
    }

    result += md.slice(cursor)
    return result
}