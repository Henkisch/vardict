import {redirect} from 'next/navigation'

// Everything happens on one page: the big screen is also where you vote (Henrik, session 3).
export default function VotePage() {
  redirect('/live')
}
