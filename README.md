## Multi-Room Chat Application

This project is a real-time multi-room chat application built with Node.js and Socket.io. It allows users to join different chat rooms and communicate instantly through a web-based interface.

The app is deployed on AWS EC2 and managed with PM2 to keep the server running continuously, making it easy to try without needing to set it up locally.

### Live Demo
http://ec2-3-137-207-13.us-east-2.compute.amazonaws.com:3457/client.html

### Features
- Join and participate in multiple chat rooms  
- Real-time messaging using WebSockets  
- Room-based conversations with live updates  

### Creative Features

#### Custom Chat Backgrounds
Each user can customize the look of their chat room by selecting their own color scheme. This customization is client-side, meaning different users in the same room can have completely different visual designs.

#### Message Reactions
Users can react to messages using a set of predefined emojis, allowing for quick feedback without sending additional messages.

#### Text Formatting
Messages support basic text formatting in public chat:
- `*text*` → **bold**
- `_text_` → *italic*

This allows users to add emphasis to their messages using simple markdown-style syntax.

### Tech Stack
- **Backend:** Node.js, Socket.io  
- **Frontend:** HTML, CSS, JavaScript  
- **Deployment:** AWS EC2  
- **Process Management:** PM2  

### Notes
This project was built to explore real-time communication, event-driven systems, and deploying Node.js applications in a production-like environment.