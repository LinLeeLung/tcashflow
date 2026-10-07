import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyCKLFFGb58oWofptKV8vUxYjildAwk9Qgs',
  authDomain: 'tcashflow-a48c3.firebaseapp.com',
  projectId: 'tcashflow-a48c3',
  storageBucket: 'tcashflow-a48c3.firebasestorage.app',
  messagingSenderId: '555948276853',
  appId: '1:555948276853:web:6bb4949966dfbc658fcc3c',
}

export const db = getFirestore(initializeApp(firebaseConfig))

export function getClientId(): string {
  let id = localStorage.getItem('tcashflow-client')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('tcashflow-client', id)
  }
  return id
}
