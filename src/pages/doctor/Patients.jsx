export default function AllPatients() {
    return (
        <div className="max-w-5xl mx-auto p-6">
            <h1 className="text-4xl font-extrabold mb-2 text-gray-900 tracking-tight">John Doe</h1>
            <p className="mb-8 text-gray-500 text-lg">Patient ID: 123456 | Age: 45 | Gender: Male</p>
            <div className="rounded-2xl shadow-xl border border-gray-100 bg-gradient-to-br from-white via-gray-50 to-gray-100 p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">Medical History</h2>
                <ul className="list-disc list-inside text-gray-700 space-y-2">
                    <li>Hypertension - Diagnosed in 2015</li>
                    <li>Type 2 Diabetes - Diagnosed in 2018</li>
                    <li>Allergy: Penicillin</li>
                    <li>Previous Surgery: Appendectomy (2010)</li>
                </ul>
            </div>
        </div>
    );
}   