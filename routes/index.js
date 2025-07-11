const express = require("express");
const userRoutes = require("./userRoutes");
const authRoutes = require("./authRoutes");
const extensionRoutes = require("./extensionRoutes");
const amiRoutes = require("./amiRoutes");
const pjsipAuthRoutes = require("./pjsip_authsRoutes");
const pjsipAorsRoutes = require("./pjsip_aorsRoutes");
const pjsipEndpointsRoutes = require("./pjsip_endpointsRoutes");
const adminDashboardRoutes = require("./adminDashboard");
const voiceRoutes = require("./voiceRoutes");
const ivrActionRoutes = require("./ivrActionRoutes");
const recordingRoutes = require("./recordingRoutes");
const ticketRoutes = require("./ticketRoutes");
const coordinatorRoutes = require("./coordinatorRoutes");
const sectionRoutes = require("./sectionRoutes");
const getCallsRoutes = require("./callsRoutes");
const macRoutes = require('./macRoutes');
const notificationRoutes = require("./notificationRoutes");
const complaintWorkflowRoutes = require("./complaintWorkflowRoutes");
const focalPersonRoutes = require("./focalPersonRoutes");
const instagramComments = require("./instagramWebhookRoutes");
const performanceRoutes = require("./performanceRoutes");
const workflowRoutes = require("./workflowRoutes");
const router = express.Router();
// const monitorRoutes = require("./monitorRoutes");
const missedCallRoutes = require("./missedCallRoutes");
const queueStatusRoutes = require("./queueStatusRoutes");


router.use("/users", userRoutes);
router.use("/auth", authRoutes);
router.use("/extensions", extensionRoutes);
router.use("/ami", amiRoutes);
router.use("/pjsip_auths", pjsipAuthRoutes);
router.use("/pjsip_aors", pjsipAorsRoutes);
router.use("/pjsip_endpoints", pjsipEndpointsRoutes);
router.use("/admin-dashboard", adminDashboardRoutes);
router.use("/ivr", voiceRoutes);
router.use("/ivr-actions", ivrActionRoutes);
router.use("/voice-notes", recordingRoutes);  
router.use("/voicenotes", recordingRoutes);  
router.use("/ticket", ticketRoutes);
router.use("/coordinator", coordinatorRoutes);
router.use("/section", sectionRoutes);
router.use("/calls", getCallsRoutes);
router.use("/mac-system", macRoutes);
// router.use("/monitor", monitorRoutes);
router.use("/missed-calls", missedCallRoutes);
router.use("/performance", performanceRoutes);
router.use("/queue-status", queueStatusRoutes);
router.use("/workflow", workflowRoutes);



router.use('/notifications', notificationRoutes);
router.use('/complaints', complaintWorkflowRoutes);
router.use('/focal-person', focalPersonRoutes);
router.use('/', instagramComments);

module.exports = router;
