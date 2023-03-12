const Attendee = require('../../models/attendee')
const aws = require('aws-sdk');
const fs = require('fs');


// INDEX ALL ATTENDEES
async function index(req, res, next) {
	try {
		Attendee.find()
			.then((attendees) => {
				return attendees
					.map((attendee) => attendee)
					.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
			})
			.then((attendees) => {
				res.status(200).json({ attendees: attendees })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

// SHOW USER ATTENDEES
async function show(req, res, next) {
	try {
		await Attendee.find({ owner: req.user._id })
			.then((attendees) => {
				return attendees.map((attendee) => attendee)
				.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
			})
			.then((attendees) => {
				res.status(200).json({ attendees: attendees })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

// SHOW ANY ATTENDEES
async function showAll(req, res, next) {
	try {
		await Attendee.findById(req.params.id)
			.then((attendees) => {
				res.status(200).json({ attendees: attendees })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

// POST
async function create(req, res, next) {
	// console.log(req.body);
	try {
	  let imageUrl;
	  if (req.file) {
		aws.config.setPromisesDependency();
		aws.config.update({
		  accessKeyId: process.env.AWS_ACCESS_KEY,
		  secretAccessKey: process.env.AWS_SECRET_KEY,
		  region: process.env.AWS_BUCKET_REGION,
		});
		const s3 = new aws.S3();

		const params = {
		  ACL: 'public-read',
		  Bucket: process.env.AWS_BUCKET_NAME,
		  Body: fs.createReadStream(req.file.path),
		  Key: `userImage/${req.file.originalname}`,
		};
		

		const data = await s3.upload(params).promise();
		fs.unlinkSync(req.file.path);
		imageUrl = data.Location;
	  }
  
	  let attendeeData = {};
	  if (req.body.attendee) {
		attendeeData = { ...req.body.attendee };
	  }
	  	  console.log(attendeeData)

	  attendeeData.image = imageUrl;
	  attendeeData.owner = req.user._id;

	  const attendee = await Attendee.create(attendeeData);
	  res.status(201).json({ attendee });
	} catch (error) {
	  console.log('Error occurred while trying to upload to S3 bucket', error);
	  res.status(400).json(error);
	}
  }


// PATCH
async function patch(req, res, next) {
	try {
		const attendee = req.body.attendee
		await Attendee.findById(req.params.id)
			.then((attendee) => {
				return attendee.updateOne(req.body.attendee)
			})
			.then((attendee) => {
				res.status(202).json({ attendee: attendee })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

// DELETE
async function remove(req, res, next) {
	try {
		await Attendee.findById(req.params.id)
			.then((attendee) => {
				return attendee.deleteOne()
			})
			.then((attendee) => {
				res.status(204).json({ attendee: attendee })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

module.exports = {
	index,
	show,
	create,
	patch,
	remove,
	showAll
}
