import {redirect} from 'next/navigation'

// The big screen is the front door.
export default function Home() {
  redirect('/live')
}
