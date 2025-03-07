module.exports = {
  apps: [
    {
      name: "WCF Call Center Service App", // Name of the React application
      script: "npm", // The script to run
      args: "start", // Arguments to pass to the script
      watch: true, // Enable watching file changes
      exec_mode: "fork", // Execution mode
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
