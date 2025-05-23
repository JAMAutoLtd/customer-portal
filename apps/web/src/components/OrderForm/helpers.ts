import { addDays, isBefore } from 'date-fns'

export const getNextAvailableDate = () => {
  let nextDate = addDays(new Date(), 1)

  // If it's a weekend, move to next Monday
  if (nextDate.getDay() === 0) {
    nextDate = addDays(nextDate, 1)
  } else if (nextDate.getDay() === 6) {
    nextDate = addDays(nextDate, 2)
  }

  return nextDate
}

export const getNextAvailableTime = () => {
  const now = new Date()
  const currentHour = now.getHours()
  if (currentHour < 9) return '9:00'
  if (currentHour >= 17) return '9:00'
  const nextHour = currentHour + 1
  return `${nextHour}:00`
}

export const formatTime = (hour: number) => {
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour > 12 ? hour - 12 : hour
  return `${displayHour}:00 ${period}`
}

export const isDateDisabled = (date: Date) => {
  const day = date.getDay()
  const today = new Date()

  const isWeekend = day === 0 || day === 6

  today.setHours(0, 0, 0, 0)
  const isBeforeTomorrow = isBefore(date, addDays(today, 1))

  return isWeekend || isBeforeTomorrow
}
