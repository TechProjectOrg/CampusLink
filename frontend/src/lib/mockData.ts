import { Student, Opportunity, Club, ChatConversation } from '../types';

export const mockStudents: Student[] = [
  {
    id: '1',
    name: 'Alex Chen',
    username: 'alexchen',
    email: 'alex.chen@gbpuat.ac.in',
    branch: 'Computer Science',
    year: 3,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
    bio: 'Passionate about AI/ML and full-stack development. Always looking for innovative projects!',
    skills: ['Python', 'Machine Learning', 'React', 'TensorFlow', 'Node.js'],
    interests: ['Artificial Intelligence', 'Web Development', 'Data Science'],
    certifications: ['AWS Cloud Practitioner', 'Google ML Crash Course'],
    projects: [],
    resumeUrl: '/resumes/alex-chen.pdf',
    accountType: 'public'
  },
  {
    id: '2',
    name: 'Sarah Martinez',
    username: 'sarahmartinez',
    email: 'sarah.martinez@gbpuat.ac.in',
    branch: 'Information Technology',
    year: 4,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
    bio: 'UI/UX enthusiast and frontend developer. Love creating beautiful, accessible web experiences.',
    skills: ['React', 'TypeScript', 'Figma', 'Tailwind CSS', 'Next.js'],
    interests: ['UI/UX Design', 'Frontend Development', 'Accessibility'],
    certifications: ['Meta Frontend Developer', 'Google UX Design'],
    projects: [],
    resumeUrl: '/resumes/sarah-martinez.pdf',
    accountType: 'public'
  },
  {
    id: '3',
    name: 'Raj Patel',
    username: 'rajpatel',
    email: 'raj.patel@gbpuat.ac.in',
    branch: 'Computer Science',
    year: 2,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Raj',
    bio: 'Competitive programmer and algorithms enthusiast. 5⭐ on CodeChef!',
    skills: ['C++', 'Data Structures', 'Algorithms', 'Python', 'Java'],
    interests: ['Competitive Programming', 'Problem Solving', 'Mathematics'],
    certifications: ['CodeChef 5 Star', 'Google Code Jam Qualifier'],
    projects: [
      {
        id: 'p4',
        title: 'Algorithm Visualizer',
        description: 'Interactive tool to visualize sorting and graph algorithms in real-time',
        link: 'https://github.com/rajp/algo-viz',
        tags: ['JavaScript', 'D3.js', 'Algorithms']
      }
    ],
    accountType: 'public',
    // connections: ['1', '2', '4'],
    // pendingRequests: []
  },
  {
    id: '4',
    name: 'Emily Johnson',
    username: 'emilyjohnson',
    email: 'emily.johnson@gbpuat.ac.in',
    branch: 'Electronics',
    year: 3,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Emily',
    bio: 'IoT and robotics developer. Building smart solutions for everyday problems.',
    skills: ['Arduino', 'Raspberry Pi', 'Python', 'C', 'IoT'],
    interests: ['Robotics', 'IoT', 'Embedded Systems'],
    certifications: ['Arduino Certified', 'Cisco IoT Fundamentals'],
    projects: [
      {
        id: 'p5',
        title: 'Smart Parking System',
        description: 'IoT-based parking system with real-time availability tracking',
        link: 'https://github.com/emilyj/smart-parking',
        tags: ['Raspberry Pi', 'Python', 'MQTT']
      }
    ],
    accountType: 'private'
  },
  {
    id: '5',
    name: 'Michael Lee',
    username: 'michaellee',
    email: 'michael.lee@gbpuat.ac.in',
    branch: 'Information Technology',
    year: 4,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Michael',
    bio: 'DevOps engineer and cloud computing enthusiast. Automating everything!',
    skills: ['Docker', 'Kubernetes', 'AWS', 'CI/CD', 'Linux'],
    interests: ['Cloud Computing', 'DevOps', 'Infrastructure'],
    certifications: ['AWS Solutions Architect', 'Kubernetes Administrator'],
    projects: [
      {
        id: 'p6',
        title: 'Auto Deploy Pipeline',
        description: 'Automated CI/CD pipeline for microservices deployment',
        link: 'https://github.com/michaell/auto-deploy',
        tags: ['Docker', 'Jenkins', 'Kubernetes']
      }
    ],
    accountType: 'public'
  },
  {
    id: '6',
    name: 'Priya Sharma',
    username: 'priyasharma',
    email: 'priya.sharma@gbpuat.ac.in',
    branch: 'Computer Science',
    year: 2,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya',
    bio: 'Mobile app developer passionate about creating impactful solutions for social good.',
    skills: ['Flutter', 'Dart', 'Firebase', 'React Native', 'Mobile Development'],
    interests: ['Mobile Development', 'Social Impact', 'Entrepreneurship'],
    certifications: ['Google Flutter Developer'],
    projects: [
      {
        id: 'p7',
        title: 'Campus Safety App',
        description: 'Emergency alert system for campus safety with real-time location sharing',
        link: 'https://github.com/priyas/safety-app',
        tags: ['Flutter', 'Firebase', 'Google Maps']
      }
    ],
    accountType: 'private'
  },
  {
    id: '7',
    name: 'Aarav Gupta',
    username: 'aaravgupta',
    email: 'aarav.gupta@gbpuat.ac.in',
    branch: 'Civil',
    year: 3,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aarav',
    bio: 'Final-year student focused on sustainable infrastructure and smart cities.',
    skills: ['AutoCAD', 'Project Planning', 'GIS'],
    interests: ['Smart Cities', 'Sustainability'],
    certifications: ['Autodesk Certified User'],
    projects: [],
    accountType: 'public'
  },
  {
    id: 'current',
    name: 'You',
    username: 'you',
    email: 'you@gbpuat.ac.in',
    branch: 'Computer Science',
    year: 3,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=You',
    bio: 'Exploring new technologies and building cool projects!',
    skills: ['JavaScript', 'React', 'Python', 'Git'],
    interests: ['Web Development', 'Open Source'],
    certifications: [],
    projects: [],
    accountType: 'private'
  }
];

export const mockOpportunities: Opportunity[] = [
  {
    id: 'o1',
    authorId: '2',
    authorName: 'Sarah Martinez',
    authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
    type: 'internship',
    title: 'Summer Internship at TechCorp',
    description: 'TechCorp is hiring software engineering interns for Summer 2025! Great opportunity to work on real-world projects with cutting-edge technologies. Requirements: Strong DSA skills, experience with React/Node.js. Apply before Nov 15th!',
    date: '2025-10-28',
    location: 'Remote',
    link: 'https://techcorp.com/careers/intern',
    image: 'https://images.unsplash.com/photo-1628017974725-18928e8e8211?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0ZWNoJTIwc3RhcnR1cCUyMG9mZmljZXxlbnwxfHx8fDE3NjE5ODg1MjR8MA&ixlib=rb-4.1.0&q=80&w=1080',
    likes: ['1', '3', '4', 'current'],
    comments: [
      {
        id: 'c1',
        authorId: '1',
        authorName: 'Alex Chen',
        authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
        content: 'Thanks for sharing! Just applied 🚀',
        timestamp: '2025-10-28T14:30:00Z'
      },
      {
        id: 'c2',
        authorId: '3',
        authorName: 'Raj Patel',
        authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Raj',
        content: 'Does anyone know what the interview process is like?',
        timestamp: '2025-10-28T15:45:00Z'
      }
    ],
    saved: ['current', '1']
  },
  {
    id: 'o2',
    authorId: '1',
    authorName: 'Alex Chen',
    authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
    type: 'hackathon',
    title: 'HackInnovate 2025 - AI/ML Theme',
    description: '36-hour hackathon focused on AI/ML solutions for social impact. Amazing prizes worth $10,000! Free food, swag, and networking with industry experts. Team size: 2-4 members. Register now!',
    date: '2025-11-15',
    location: 'Main Campus Auditorium',
    link: 'https://hackinnovate.com',
    image: 'https://images.unsplash.com/photo-1638029202288-451a89e0d55f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoYWNrYXRob24lMjBjb2Rpbmd8ZW58MXx8fHwxNzYxOTM5NTY5fDA&ixlib=rb-4.1.0&q=80&w=1080',
    likes: ['2', '3', '5', '6', 'current'],
    comments: [
      {
        id: 'c3',
        authorId: '6',
        authorName: 'Priya Sharma',
        authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya',
        content: 'Looking for teammates! I have experience with Flutter and Firebase. DM me!',
        timestamp: '2025-10-29T10:00:00Z'
      }
    ],
    saved: ['current', '2', '3']
  },
  {
    id: 'o3',
    authorId: '4',
    authorName: 'Emily Johnson',
    authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Emily',
    type: 'event',
    title: 'IoT Workshop: Building Smart Devices',
    description: 'Hands-on workshop on IoT development using Arduino and Raspberry Pi. Learn to build your own smart home devices! Limited seats - 50 participants. Free for all students. Bring your laptop!',
    date: '2025-11-05',
    location: 'Electronics Lab, Building C',
    image: 'https://images.unsplash.com/photo-1517420704952-d9f39e95b43e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpb3QlMjBlbGVjdHJvbmljcyUyMHdvcmtzaG9wfGVufDF8fHx8MTc2MjAyMjIxOXww&ixlib=rb-4.1.0&q=80&w=1080',
    likes: ['1', '6', 'current'],
    comments: [],
    saved: []
  },
  {
    id: 'o4',
    authorId: '3',
    authorName: 'Raj Patel',
    authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Raj',
    type: 'contest',
    title: 'CodeSprint Monthly Contest',
    description: 'Monthly coding contest with challenging algorithmic problems. Top 3 winners get Amazon vouchers! Perfect practice for placement preparation. Duration: 3 hours. All are welcome!',
    date: '2025-11-08',
    location: 'Online',
    link: 'https://codesprint.gbpuat.ac.in',
    image: 'https://images.unsplash.com/photo-1562758778-e5638b5b6607?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9ncmFtbWluZyUyMGNvbnRlc3R8ZW58MXx8fHwxNzYyMDIyMjIwfDA&ixlib=rb-4.1.0&q=80&w=1080',
    likes: ['1', '2', '5'],
    comments: [
      {
        id: 'c4',
        authorId: '1',
        authorName: 'Alex Chen',
        authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
        content: 'Count me in! Been practicing for this 💪',
        timestamp: '2025-10-30T12:00:00Z'
      }
    ],
    saved: ['current']
  },
  {
    id: 'o5',
    authorId: '5',
    authorName: 'Michael Lee',
    authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Michael',
    type: 'club',
    title: 'DevOps Club - Weekly Meetup',
    description: 'Join us for our weekly DevOps club meetup! This week: Introduction to Kubernetes and container orchestration. Pizza and refreshments provided. Beginners welcome!',
    date: '2025-11-03',
    location: 'Computer Lab 3',
    image: 'https://images.unsplash.com/photo-1563461660947-507ef49e9c47?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZXZlbG9wZXIlMjBtZWV0dXB8ZW58MXx8fHwxNzYxOTAyNjQ3fDA&ixlib=rb-4.1.0&q=80&w=1080',
    likes: ['1', '2'],
    comments: [],
    saved: []
  }
];

export const mockClubs: Club[] = [
  {
    id: 'club1',
    name: 'Coding Club',
    description: 'Learn, practice, and compete in coding challenges. We organize weekly contests and workshops.',
    avatar: 'https://images.unsplash.com/photo-1638202677704-b74690bb8fa9?w=400',
    members: ['1', '2', '3', '5', 'current'],
    admin: '3',
    posts: ['o4']
  },
  {
    id: 'club2',
    name: 'AI/ML Enthusiasts',
    description: 'Exploring artificial intelligence and machine learning through projects and research.',
    avatar: 'https://images.unsplash.com/photo-1758270705482-cee87ea98738?w=400',
    members: ['1', '6', 'current'],
    admin: '1',
    posts: ['o2']
  },
  {
    id: 'club3',
    name: 'Robotics Club',
    description: 'Building autonomous robots and competing in inter-college competitions.',
    avatar: 'https://images.unsplash.com/photo-1716703432455-3045789de738?w=400',
    members: ['4', '6', 'current'],
    admin: '4',
    posts: ['o3']
  },
  {
    id: 'club4',
    name: 'Web Dev Society',
    description: 'Full-stack web development, modern frameworks, and building real-world applications.',
    avatar: 'https://images.unsplash.com/photo-1630283017802-785b7aff9aac?w=400',
    members: ['1', '2', '5', 'current'],
    admin: '2',
    posts: []
  }
];

export const mockConversations: ChatConversation[] = [
  {
    id: 'chat1',
    participantId: '1',
    participantName: 'Alex Chen',
    participantAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
    lastMessage: 'Hey! Want to team up for the hackathon?',
    timestamp: '2025-11-01T09:30:00Z',
    unread: 2,
    isGroup: false
  },
  {
    id: 'chat2',
    participantId: '2',
    participantName: 'Sarah Martinez',
    participantAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
    lastMessage: 'Thanks for the UI feedback on my project!',
    timestamp: '2025-10-31T16:20:00Z',
    unread: 0,
    isGroup: false
  },
  {
    id: 'group1',
    participantId: 'group1',
    participantName: 'CS Project Team 🚀',
    participantAvatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=CSProject',
    lastMessage: 'Let\'s finalize the presentation slides by tomorrow',
    timestamp: '2025-11-02T18:45:00Z',
    unread: 3,
    isGroup: true,
    groupMembers: ['current', '1', '2', '5']
  },
  {
    id: 'chat3',
    participantId: '3',
    participantName: 'Raj Patel',
    participantAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Raj',
    lastMessage: 'Can you help me with that DP problem?',
    timestamp: '2025-10-30T14:15:00Z',
    unread: 1,
    isGroup: false
  },
  {
    id: 'chat4',
    participantId: '4',
    participantName: 'Emily Johnson',
    participantAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Emily',
    lastMessage: 'IoT workshop is tomorrow, excited!',
    timestamp: '2025-11-04T10:00:00Z',
    unread: 0,
    isGroup: false
  },
  {
    id: 'chat5',
    participantId: '6',
    participantName: 'Priya Sharma',
    participantAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya',
    lastMessage: 'Don\'t forget about the Flutter dev session.',
    timestamp: '2025-11-03T11:40:00Z',
    unread: 1,
    isGroup: false
  },
  {
    id: 'group2',
    participantId: 'group2',
    participantName: 'Hackathon Squad 💻',
    participantAvatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=Hackathon',
    lastMessage: 'Meeting at 7 PM to discuss project ideas.',
    timestamp: '2025-11-04T19:00:00Z',
    unread: 5,
    isGroup: true,
    groupMembers: ['current', '3', '6']
  },
  {
    id: 'group3',
    participantId: 'group3',
    participantName: 'Web Dev Enthusiasts 🌐',
    participantAvatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=WebDev',
    lastMessage: 'New tutorial on Next.js 14 out now!',
    timestamp: '2025-11-05T09:00:00Z',
    unread: 0,
    isGroup: true,
    groupMembers: ['current', '1', '2', '4', '5']
  }
];

export const getCurrentUser = () => mockStudents.find(s => s.id === 'current')!;;