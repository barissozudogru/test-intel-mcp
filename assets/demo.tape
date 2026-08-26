Output assets/demo.gif

Set Shell "zsh"
Set FontSize 19
Set Width 1280
Set Height 600
Set Theme "Catppuccin Mocha"
Set TypingSpeed 18ms
Set PlaybackSpeed 1
Set Framerate 30

Hide
Type "mkdir -p /tmp/test-intel-demo/coverage"
Enter
Type "cp evidence/p-limit-7.3.1/lcov.info /tmp/test-intel-demo/coverage/lcov.info"
Enter
Type "cd /tmp/test-intel-demo"
Enter
Type "clear"
Enter
Show
Sleep 500ms
Type "npx -y -p @barissozudogru/test-intel-mcp test-intel-report coverage/lcov.info"
Sleep 800ms
Enter
Sleep 5s
