import { spawn } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const processes = [
  spawn(npmCommand, ['run', 'server'], { stdio: 'inherit', shell: false }),
  spawn(npmCommand, ['run', 'dev'], { stdio: 'inherit', shell: false }),
]

const stopAll = (signal) => {
  for (const child of processes) {
    if (!child.killed) child.kill(signal)
  }
}

for (const child of processes) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      stopAll('SIGTERM')
      process.exit(code)
    }
  })
}

process.on('SIGINT', () => {
  stopAll('SIGINT')
  process.exit(0)
})

process.on('SIGTERM', () => {
  stopAll('SIGTERM')
  process.exit(0)
})
