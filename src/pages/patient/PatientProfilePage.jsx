export default function PatientProfile() {
    return (
        <div className="max-w-5xl mx-auto p-6">
            <h1 className="text-4xl font-extrabold mb-2 text-gray-900 tracking-tight">John Doe</h1>
            <p className="mb-8 text-gray-500 text-lg">Patient ID: 123456 | Age: 45 | Gender:   Male</p>

            <div className="bg-white shadow rounded-lg p-6 mb-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-800">Medical History</h2>
                <ul className="list-disc list-inside text-gray-600">
                    <li>Hypertension (Diagnosed in 2015)</li>
                    <li>Type 2 Diabetes (Diagnosed in 2018)</li>
                    <li>Previous heart attack (2019)</li>
                </ul>
            </div>

            <div className="bg-white shadow rounded-lg p-6 mb-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-800">Current Medications</h2>
                <ul className="list-disc list-inside text-gray-600">
                    <li>Lisinopril 10mg daily</li>
                    <li>Metformin 500mg twice daily</li>
                    <li>Aspirin 81mg daily</li>
                </ul>
            </div>
            
            <div className="bg-white shadow rounded-lg p-6"> 
                <h2 className="text-2xl font-bold mb-4 text-gray-800">Recent Sessions</h2>
                <ul className="list-disc list-inside text-gray-600">
                    <li>Session on 2024-05-01: Follow-up on blood pressure management</li>
                    <li>Session on 2024-04-15: Discussion about diabetes control</li>
                    <li>Session on 2024-03-20: Post-heart attack recovery check-in</li>
                </ul>
            </div>
        </div>
    );
}