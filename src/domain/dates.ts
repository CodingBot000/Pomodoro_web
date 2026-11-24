const formatters = new Map<string, Intl.DateTimeFormat>()

export function currentZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

function dateParts(time: number, zone: string) {
  let formatter = formatters.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    formatters.set(zone, formatter)
  }
  return Object.fromEntries(formatter.formatToParts(time).map(({ type, value }) => [type, value]))
}

export function dateKey(time: number, zone: string) {
  const { year, month, day } = dateParts(time, zone)
  return [year, month, day].join('-')
}

export function dateStamp(time: number, zone: string) {
  const { year, month, day, hour, minute } = dateParts(time, zone)
  return `${year}.${month}.${day} ${hour}:${minute}`
}

export function offsetDate(key: string, days: number) {
  const date = new Date(key + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function weekStart(key: string) {
  const weekday = new Date(key + 'T00:00:00Z').getUTCDay()
  return offsetDate(key, -((weekday + 6) % 7))
}
