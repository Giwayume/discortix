
function detectOS() {
    /** @see https://developer.mozilla.org/en-US/docs/Web/API/Navigator/userAgentData */
    const platform = (navigator as any).userAgentData?.platform
    if (platform) {
        return platform
    }
    const ua = navigator.userAgent
    if (/android/i.test(ua)) return 'Android'
    if (/(ipad|iphone|ipod)/i.test(ua)) return 'iOS'
    if (/windows phone/i.test(ua)) return 'Windows Phone'
    if (/win(dows)?/i.test(ua)) return 'Windows'
    if (/macintosh|mac os x/i.test(ua)) return 'macOS'
    if (/cros/i.test(ua)) return 'Chrome OS'
    if (/linux/i.test(ua)) return 'Linux'
    return 'Unknown OS'
}

function detectBrowser() {
    /** @see https://developer.mozilla.org/en-US/docs/Web/API/Navigator/userAgentData */
    const userAgentData = (navigator as any).userAgentData;
    if (userAgentData?.brands?.length) {
        const real = userAgentData.brands.find((b: any) => b.brand !== 'Chromium')
        if (real) return real.brand
    }

    const ua = navigator.userAgent
    if (/edg(e|a|ios)/i.test(ua)) return 'Edge'
    if (/opr\/|opera/i.test(ua)) return 'Opera'
    if (/chrome|crios/i.test(ua)) return 'Chrome'
    if (/firefox|fxios/i.test(ua)) return 'Firefox'
    if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) return 'Safari'
    if (/msie|trident/i.test(ua)) return 'Internet Explorer'
    return 'Unknown Browser'
}

function getDeviceName() {
    return `Discortix · ${detectBrowser()} on ${detectOS()}`
}

export function useUserAgent() {

    return {
        getDeviceName,
    }

}
